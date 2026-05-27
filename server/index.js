require('dotenv').config();

process.on('uncaughtException', (err) => console.error('[crash] uncaughtException:', err));
process.on('unhandledRejection', (reason) => console.error('[crash] unhandledRejection:', reason));

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const { pickQuestions } = require('./questions');
const { updateElo } = require('./elo');
const { updateStreak } = require('./streak');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 5000,
  pingInterval: 10000,
});

// ─── Supabase ─────────────────────────────────────────────────────────────────

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { realtime: { transport: ws } }
    );
  }
  return _supabase;
}

// ─── State ────────────────────────────────────────────────────────────────────

// queue entry: { socketId, userId, displayName, elo, subject, joinedAt }
const queue = [];

// roomId → { roomId, players, questions, subject, battleStartedAt, progress }
// players[socketId] = { socketId, userId, displayName, elo, subject }
// progress[socketId] = { questionIndex, score, done, finishedAt }
const battles = new Map();

// userId → { roomId, oldSocketId, timer, intervalTimer }
const pendingReconnects = new Map();

// ─── Battle limit helpers ─────────────────────────────────────────────────────

async function checkBattleLimit(userId) {
  if (!process.env.SUPABASE_URL) return { allowed: true };
  const supabase = getSupabase();
  const { data: p } = await supabase
    .from('profiles')
    .select('battles_today, battles_reset_date, is_premium')
    .eq('id', userId)
    .single();

  if (!p || p.is_premium) return { allowed: true };

  const today = new Date().toISOString().slice(0, 10);
  const battlesToday = p.battles_reset_date === today ? (p.battles_today ?? 0) : 0;

  if (battlesToday >= 3) {
    const reset = new Date();
    reset.setUTCHours(24, 0, 0, 0);
    return { allowed: false, resetAt: reset.toISOString() };
  }
  return { allowed: true };
}

async function incrementBattleCount(userId) {
  if (!process.env.SUPABASE_URL) return;
  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const { data: p } = await supabase
    .from('profiles')
    .select('battles_today, battles_reset_date')
    .eq('id', userId)
    .single();
  if (!p) return;
  const battlesToday = p.battles_reset_date === today ? (p.battles_today ?? 0) : 0;
  await supabase.from('profiles').update({
    battles_today: battlesToday + 1,
    battles_reset_date: today,
  }).eq('id', userId);
}

// ─── Matchmaking ──────────────────────────────────────────────────────────────

function tryMatch() {
  if (queue.length < 2) return;

  const now = Date.now();

  // Expire players in queue > 60s
  for (let i = queue.length - 1; i >= 0; i--) {
    const p = queue[i];
    if (now - p.joinedAt >= 60000) {
      queue.splice(i, 1);
      io.to(p.socketId).emit('queue_timeout');
      console.log(`[queue] timeout: ${p.displayName}`);
    }
  }

  // Find a match for each waiting player
  for (let i = 0; i < queue.length; i++) {
    const p1 = queue[i];
    const elapsed = now - p1.joinedAt;
    const bracket = elapsed >= 30000 ? 400 : 200;

    for (let j = i + 1; j < queue.length; j++) {
      const p2 = queue[j];
      if (p1.subject !== p2.subject) continue;
      if (Math.abs((p1.elo ?? 1000) - (p2.elo ?? 1000)) > bracket) continue;

      queue.splice(j, 1);
      queue.splice(i, 1);
      createBattle(p1, p2);
      return;
    }
  }
}

// Run matchmaking on a 5-second interval (supplements event-driven matching)
setInterval(tryMatch, 5000);

function createBattle(p1, p2) {
  const roomId = `battle_${Date.now()}`;

  const state = {
    roomId,
    players: {
      [p1.socketId]: { ...p1 },
      [p2.socketId]: { ...p2 },
    },
    questions: [],
    subject: p1.subject,
    battleStartedAt: null,
    progress: {
      [p1.socketId]: { questionIndex: 0, score: 0, done: false, finishedAt: null },
      [p2.socketId]: { questionIndex: 0, score: 0, done: false, finishedAt: null },
    },
  };

  battles.set(roomId, state);
  io.sockets.sockets.get(p1.socketId)?.join(roomId);
  io.sockets.sockets.get(p2.socketId)?.join(roomId);

  io.to(p1.socketId).emit('match_found', {
    roomId,
    opponent: { userId: p2.userId, displayName: p2.displayName },
  });
  io.to(p2.socketId).emit('match_found', {
    roomId,
    opponent: { userId: p1.userId, displayName: p1.displayName },
  });

  console.log(`[match] ${p1.displayName} vs ${p2.displayName} → ${roomId} (${p1.subject})`);
  setTimeout(() => startBattle(roomId), 3000);
}

// ─── Battle flow ──────────────────────────────────────────────────────────────

async function startBattle(roomId) {
  const state = battles.get(roomId);
  if (!state) return;

  const sids = Object.keys(state.players);

  // Check battle limits before starting
  for (const sid of sids) {
    const { userId } = state.players[sid];
    const { allowed, resetAt } = await checkBattleLimit(userId);
    if (!allowed) {
      io.to(sid).emit('battle_limit_reached', { resetAt });
      const otherId = sids.find(id => id !== sid);
      if (otherId) {
        const other = state.players[otherId];
        queue.unshift({ ...other, joinedAt: Date.now() });
        io.to(otherId).emit('queue_joined', { position: 1 });
      }
      battles.delete(roomId);
      return;
    }
  }

  state.questions = await pickQuestions(state.subject, 1);
  state.battleStartedAt = Date.now();
  // Send each player their first question independently
  for (const sid of Object.keys(state.players)) {
    sendNextQuestion(roomId, sid);
  }
}

function sendNextQuestion(roomId, socketId) {
  const state = battles.get(roomId);
  if (!state) return;
  const prog = state.progress[socketId];
  if (!prog || prog.done) return;

  const q = state.questions[prog.questionIndex];
  if (!q) {
    finishPlayer(roomId, socketId);
    return;
  }

  io.to(socketId).emit('question', {
    index: prog.questionIndex,
    total: state.questions.length,
    question: q,
  });
}

function getOpponentScore(state, mySocketId) {
  const oppId = Object.keys(state.players).find(id => id !== mySocketId);
  return oppId ? (state.progress[oppId]?.score ?? 0) : 0;
}

function handleAnswer(roomId, socketId, answerIndex) {
  const state = battles.get(roomId);
  if (!state) return;

  const prog = state.progress[socketId];
  if (!prog || prog.done) return;

  const q = state.questions[prog.questionIndex];
  if (!q) return;

  const correct = answerIndex === q.correct_index;
  if (correct) prog.score++;

  // Immediate per-player feedback
  io.to(socketId).emit('question_result', {
    correct_index: q.correct_index,
    your_answer: answerIndex,
    correct,
    score: prog.score,
    opponent_score: getOpponentScore(state, socketId),
  });

  prog.questionIndex++;

  // Tell opponent about progress
  const oppId = Object.keys(state.players).find(id => id !== socketId);
  if (oppId) {
    io.to(oppId).emit('opponent_progress', {
      score: prog.score,
      questionIndex: prog.questionIndex,
      done: prog.done,
    });
  }

  // Advance this player after a short reveal
  setTimeout(() => {
    if (prog.questionIndex >= state.questions.length) {
      finishPlayer(roomId, socketId);
    } else {
      sendNextQuestion(roomId, socketId);
    }
  }, 1500);
}

function finishPlayer(roomId, socketId) {
  const state = battles.get(roomId);
  if (!state) return;
  const prog = state.progress[socketId];
  if (!prog) return;

  prog.done = true;
  prog.finishedAt = Date.now();

  io.to(socketId).emit('you_finished', {
    score: prog.score,
    opponent_score: getOpponentScore(state, socketId),
  });

  const allDone = Object.values(state.progress).every(p => p.done);
  if (allDone) endBattle(roomId);
}

async function endBattle(roomId) {
  const state = battles.get(roomId);
  if (!state) return;

  const sids = Object.keys(state.players);
  const scores = Object.fromEntries(sids.map(sid => [sid, state.progress[sid].score]));

  const [s1, s2] = sids.map(sid => scores[sid]);
  const [t1, t2] = sids.map(sid => state.progress[sid].finishedAt ?? Date.now());

  let winner = null;
  if (s1 > s2) winner = sids[0];
  else if (s2 > s1) winner = sids[1];
  else if (t1 < t2) winner = sids[0]; // same score — faster player wins
  else if (t2 < t1) winner = sids[1];

  const stateForElo = { ...state };

  let eloDeltas = {};
  try {
    eloDeltas = await updateElo(stateForElo, winner);
  } catch (err) {
    console.error('[elo] update failed:', err);
  }

  // Update streaks and battle counts
  for (const sid of sids) {
    const { userId } = state.players[sid];
    try { await updateStreak(userId); } catch (err) { console.error('[streak]', err); }
    try { await incrementBattleCount(userId); } catch (err) { console.error('[limit]', err); }
  }

  io.to(roomId).emit('battle_complete', { scores, winner, eloDeltas });
  battles.delete(roomId);
  console.log(`[complete] ${roomId} — ${JSON.stringify(scores)}`);
}

// ─── Disconnect / reconnect ───────────────────────────────────────────────────

function handleDisconnect(socketId) {
  const qi = queue.findIndex(p => p.socketId === socketId);
  if (qi !== -1) queue.splice(qi, 1);

  for (const [roomId, state] of battles.entries()) {
    if (!state.players[socketId]) continue;

    const player = state.players[socketId];
    const remainingId = Object.keys(state.players).find(id => id !== socketId);

    if (!remainingId) {
      battles.delete(roomId);
      break;
    }

    let countdown = 10;
    io.to(remainingId).emit('opponent_disconnected');
    io.to(remainingId).emit('opponent_reconnect_countdown', { seconds: countdown });

    const intervalTimer = setInterval(() => {
      countdown--;
      io.to(remainingId).emit('opponent_reconnect_countdown', { seconds: countdown });
    }, 1000);

    const timer = setTimeout(() => {
      clearInterval(intervalTimer);
      pendingReconnects.delete(player.userId);
      const currentState = battles.get(roomId);
      if (!currentState) return;
      // Forfeit disconnected player
      if (currentState.progress[socketId]) {
        currentState.progress[socketId].done = true;
        currentState.progress[socketId].finishedAt = Date.now();
        currentState.progress[socketId].score = 0;
      }
      endBattle(roomId);
    }, 10000);

    pendingReconnects.set(player.userId, { roomId, oldSocketId: socketId, timer, intervalTimer });
    console.log(`[disconnect] ${player.displayName} — 10s grace in ${roomId}`);
    break;
  }
}

function handleReconnect(socket, userId, displayName) {
  const pending = pendingReconnects.get(userId);
  if (!pending) return false;

  clearTimeout(pending.timer);
  clearInterval(pending.intervalTimer);
  pendingReconnects.delete(userId);

  const state = battles.get(pending.roomId);
  if (!state) return false;

  const { oldSocketId } = pending;
  if (state.players[oldSocketId]) {
    state.players[socket.id] = { ...state.players[oldSocketId], socketId: socket.id };
    delete state.players[oldSocketId];
    state.progress[socket.id] = state.progress[oldSocketId];
    delete state.progress[oldSocketId];
  }

  socket.join(pending.roomId);

  const otherId = Object.keys(state.players).find(id => id !== socket.id);
  if (otherId) io.to(otherId).emit('opponent_reconnected');

  // Resume: send current question for this player
  const prog = state.progress[socket.id];
  if (prog && !prog.done) {
    const q = state.questions[prog.questionIndex];
    if (q) {
      socket.emit('question', {
        index: prog.questionIndex,
        total: state.questions.length,
        question: q,
      });
    }
  }

  console.log(`[reconnect] ${displayName} resumed ${pending.roomId}`);
  return true;
}

// ─── Socket events ────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('join_queue', ({ userId, displayName, elo = 1000, subject = 'AP Chemistry' }) => {
    // Check if this is a reconnect
    if (userId && handleReconnect(socket, userId, displayName)) return;

    const existing = queue.findIndex(p => p.socketId === socket.id);
    if (existing !== -1) queue.splice(existing, 1);

    queue.push({ socketId: socket.id, userId, displayName, elo, subject, joinedAt: Date.now() });
    socket.emit('queue_joined', { position: queue.length });
    console.log(`[queue] ${displayName} joined (${subject}, elo=${elo}, queue=${queue.length})`);
    tryMatch();
  });

  socket.on('leave_queue', () => {
    const i = queue.findIndex(p => p.socketId === socket.id);
    if (i !== -1) { queue.splice(i, 1); socket.emit('queue_left'); }
  });

  socket.on('submit_answer', ({ roomId, answerIndex }) => {
    handleAnswer(roomId, socket.id, answerIndex);
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    handleDisconnect(socket.id);
  });
});

// ─── HTTP ─────────────────────────────────────────────────────────────────────

// Challenge creation endpoint (task #15)
app.post('/challenge', async (req, res) => {
  try {
    const { challengerId, subject = 'AP Chemistry' } = req.body;
    if (!challengerId) return res.status(400).json({ error: 'challengerId required' });

    if (!process.env.SUPABASE_URL) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const questions = await pickQuestions(subject, 10);
    const questionIds = questions.map(q => q.id);

    const supabase = getSupabase();
    const { data, error } = await supabase.from('challenges').insert({
      challenger_id: challengerId,
      subject,
      question_ids: questionIds,
      questions_json: questions,
      status: 'pending',
    }).select('id').single();

    if (error) throw error;

    return res.json({ challengeId: data.id, questions });
  } catch (err) {
    console.error('[challenge] create failed:', err);
    return res.status(500).json({ error: 'Failed to create challenge' });
  }
});

// Challenge submission endpoint
app.post('/challenge/:id/submit', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, answers, timeMs } = req.body;
    if (!userId || !answers) return res.status(400).json({ error: 'userId and answers required' });

    if (!process.env.SUPABASE_URL) return res.status(503).json({ error: 'Database not configured' });

    const supabase = getSupabase();
    const { data: challenge, error: fetchErr } = await supabase
      .from('challenges')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !challenge) return res.status(404).json({ error: 'Challenge not found' });
    if (challenge.status !== 'pending') return res.status(400).json({ error: 'Challenge already completed' });

    const questions = challenge.questions_json;
    let score = 0;
    for (let i = 0; i < questions.length; i++) {
      if (answers[i] === questions[i].correct_index) score++;
    }

    const isChallenger = challenge.challenger_id === userId;
    const update = isChallenger
      ? { challenger_answers: answers, challenger_score: score, challenger_time_ms: timeMs }
      : { opponent_id: userId, opponent_answers: answers, opponent_score: score, opponent_time_ms: timeMs };

    // Resolve if opponent just submitted (challenger already submitted)
    let resolvedUpdate = {};
    if (!isChallenger && challenge.challenger_answers) {
      const cs = challenge.challenger_score ?? 0;
      const winnerId = score > cs ? userId
        : cs > score ? challenge.challenger_id
        : null;
      resolvedUpdate = { status: 'completed', winner_id: winnerId };

      // Update ELO
      try {
        const stateForElo = {
          subject: challenge.subject,
          players: {
            'p1': { userId: challenge.challenger_id, elo: 1000 },
            'p2': { userId, elo: 1000 },
          },
          progress: { p1: { score: cs }, p2: { score } },
        };
        await updateElo(stateForElo, winnerId === challenge.challenger_id ? 'p1' : winnerId === userId ? 'p2' : null);
      } catch (e) { console.error('[challenge-elo]', e); }
    }

    await supabase.from('challenges').update({ ...update, ...resolvedUpdate }).eq('id', id);

    return res.json({ score, total: questions.length, ...resolvedUpdate });
  } catch (err) {
    console.error('[challenge] submit failed:', err);
    return res.status(500).json({ error: 'Submission failed' });
  }
});

app.get('/challenge/:id', async (req, res) => {
  if (!process.env.SUPABASE_URL) return res.status(503).json({ error: 'Database not configured' });
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('challenges')
    .select('id, subject, questions_json, status, expires_at, challenger_id, challenger_score, opponent_score, winner_id')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
  return res.json(data);
});

app.get('/health', (_, res) => {
  res.json({ ok: true, queue: queue.length, battles: battles.size });
});

const PORT = process.env.PORT || 4000;
console.log(`[startup] PORT env = "${process.env.PORT}" → binding :${PORT}`);
server.listen(PORT, '0.0.0.0', () => console.log(`[startup] Battle server listening on 0.0.0.0:${PORT}`));
