require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { pickQuestions } = require('./questions');
const { updateElo } = require('./elo');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ─── State ────────────────────────────────────────────────────────────────────

const queue = [];          // [{ socketId, userId, displayName, elo }]
const battles = new Map(); // roomId → battleState

// Per-player progress shape:
// progress[socketId] = { questionIndex, score, done }

// ─── Matchmaking ──────────────────────────────────────────────────────────────

function tryMatch() {
  if (queue.length < 2) return;

  const p1 = queue.shift();
  const p2 = queue.shift();
  const roomId = `battle_${Date.now()}`;

  const state = {
    roomId,
    players: { [p1.socketId]: p1, [p2.socketId]: p2 },
    questions: [],
    progress: {
      [p1.socketId]: { questionIndex: 0, score: 0, done: false },
      [p2.socketId]: { questionIndex: 0, score: 0, done: false },
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

  console.log(`[match] ${p1.displayName} vs ${p2.displayName} → ${roomId}`);

  setTimeout(() => startBattle(roomId), 3000);
}

// ─── Battle flow ──────────────────────────────────────────────────────────────

function startBattle(roomId) {
  const state = battles.get(roomId);
  if (!state) return;

  state.questions = pickQuestions(10);

  // Send each player their first question independently
  for (const socketId of Object.keys(state.players)) {
    sendNextQuestion(roomId, socketId);
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

  const socket = io.sockets.sockets.get(socketId);
  if (!socket) return;

  socket.emit('question', {
    index: prog.questionIndex,
    total: state.questions.length,
    question: q,
  });
}


function finishPlayer(roomId, socketId) {
  const state = battles.get(roomId);
  if (!state) return;
  const prog = state.progress[socketId];
  if (!prog) return;

  prog.done = true;

  console.log(`[done] ${state.players[socketId]?.displayName} finished — score: ${prog.score}`);

  // Tell this player they're done; they'll wait for opponent
  io.to(socketId).emit('you_finished', {
    score: prog.score,
    opponent_score: getOpponentScore(state, socketId),
  });

  // Check if both players are done
  const allDone = Object.values(state.progress).every(p => p.done);
  if (allDone) endBattle(roomId);
}

async function endBattle(roomId) {
  const state = battles.get(roomId);
  if (!state) return;

  const scores = {};
  for (const [sid, prog] of Object.entries(state.progress)) {
    scores[sid] = prog.score;
  }

  const playerIds = Object.keys(scores);
  const [s1, s2] = playerIds.map(id => scores[id]);
  let winner = null;
  if (s1 > s2) winner = playerIds[0];
  else if (s2 > s1) winner = playerIds[1];

  // Update ELO in Supabase then broadcast result with deltas
  let eloDeltas = {};
  try {
    eloDeltas = await updateElo(state, winner);
  } catch (err) {
    console.error('[elo] update failed:', err.message);
  }

  io.to(roomId).emit('battle_complete', { scores, winner, eloDeltas });
  battles.delete(roomId);
  console.log(`[complete] ${roomId} — scores: ${JSON.stringify(scores)}`);
}

function getOpponentScore(state, mySocketId) {
  const oppId = Object.keys(state.players).find(id => id !== mySocketId);
  return oppId ? state.progress[oppId]?.score ?? 0 : 0;
}

function emitOpponentProgress(state, advancedSocketId) {
  // Tell the opponent this player's updated score/progress
  const oppId = Object.keys(state.players).find(id => id !== advancedSocketId);
  if (!oppId) return;
  const myProg = state.progress[advancedSocketId];
  io.to(oppId).emit('opponent_progress', {
    score: myProg.score,
    questionIndex: myProg.questionIndex,
    done: myProg.done,
  });
}

// ─── Socket events ────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('join_queue', ({ userId, displayName, elo = 1000 }) => {
    const existing = queue.findIndex(p => p.socketId === socket.id);
    if (existing !== -1) queue.splice(existing, 1);

    queue.push({ socketId: socket.id, userId, displayName, elo });
    socket.emit('queue_joined', { position: queue.length });
    console.log(`[queue] ${displayName} joined (queue size: ${queue.length})`);
    tryMatch();
  });

  socket.on('leave_queue', () => {
    const i = queue.findIndex(p => p.socketId === socket.id);
    if (i !== -1) { queue.splice(i, 1); socket.emit('queue_left'); }
  });

  socket.on('submit_answer', ({ roomId, answerIndex }) => {
    const state = battles.get(roomId);
    if (!state) return;

    const prog = state.progress[socket.id];
    if (!prog || prog.done) return;

    const q = state.questions[prog.questionIndex];
    if (!q) return;

    const correct = answerIndex === q.correct_index;
    if (correct) prog.score++;

    // Immediate feedback to this player only
    socket.emit('question_result', {
      correct_index: q.correct_index,
      your_answer: answerIndex,
      correct,
      score: prog.score,
      opponent_score: getOpponentScore(state, socket.id),
    });

    prog.questionIndex++;
    emitOpponentProgress(state, socket.id);

    // Advance this player after a short reveal pause
    setTimeout(() => {
      if (prog.questionIndex >= state.questions.length) {
        finishPlayer(roomId, socket.id);
      } else {
        sendNextQuestion(roomId, socket.id);
      }
    }, 1500);
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    const qi = queue.findIndex(p => p.socketId === socket.id);
    if (qi !== -1) queue.splice(qi, 1);

    for (const [roomId, state] of battles.entries()) {
      if (state.players[socket.id]) {
        const remaining = Object.keys(state.players).find(id => id !== socket.id);
        if (remaining) {
          io.to(remaining).emit('opponent_disconnected');
          // Award remaining player a win by marking disconnected player as done with 0
          state.progress[socket.id].done = true;
          state.progress[socket.id].score = -1; // ensures remaining player wins
          finishPlayer(roomId, remaining); // this will trigger endBattle since both done
        } else {
          battles.delete(roomId);
        }
        break;
      }
    }
  });
});

app.get('/health', (_, res) => res.json({ ok: true, queue: queue.length, battles: battles.size }));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Battle server on :${PORT}`));
