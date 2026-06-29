const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const ACTIVE_WINDOW_MS = 15_000;
const REBROADCAST_MS = 2_000;
const TIMELINE_WINDOW_MS = 120_000;
const MAX_HISTORY_ITEMS = 12;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const sessions = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.redirect("/audience.html?session=cosima-workshop");
});

app.get("/audience", (_req, res) => {
  res.redirect("/audience.html?session=cosima-workshop");
});

app.get("/chair", (_req, res) => {
  res.redirect("/presenter.html?session=cosima-workshop");
});

app.get("/presenter", (req, res) => {
  const sessionId = normalizeSessionId(req.query.session);
  res.redirect(`/presenter.html?session=${encodeURIComponent(sessionId)}&popup=1`);
});

function normalizeSessionId(rawSessionId) {
  const sessionId = String(rawSessionId || "cosima-workshop").trim();
  return sessionId || "cosima-workshop";
}

function clampValue(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  return Math.min(100, Math.max(0, numericValue));
}

function getRoomName(sessionId) {
  return `session:${sessionId}`;
}

function createSession() {
  return {
    checkpointNumber: 1,
    participants: new Map(),
    history: [],
    timeline: [],
    current: {
      peakActiveCount: 0,
      averageSum: 0,
      averageSamples: 0,
      lastAverage: null
    }
  };
}

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, createSession());
  }
  return sessions.get(sessionId);
}

function resetCurrentCheckpoint(session) {
  session.participants.clear();
  session.timeline = [];
  session.current = {
    peakActiveCount: 0,
    averageSum: 0,
    averageSamples: 0,
    lastAverage: null
  };
}

function pruneInactiveParticipants(session, now = Date.now()) {
  for (const [participantId, participant] of session.participants.entries()) {
    if (participant.socketId) {
      continue;
    }

    if (participant.disconnectedAt && now - participant.disconnectedAt > ACTIVE_WINDOW_MS) {
      session.participants.delete(participantId);
      continue;
    }

    if (!participant.disconnectedAt && now - participant.updatedAt > ACTIVE_WINDOW_MS) {
      session.participants.delete(participantId);
    }
  }
}

function calculateAggregate(session, options = {}) {
  const { now = Date.now(), trackSample = false } = options;
  pruneInactiveParticipants(session, now);

  const activeParticipants = Array.from(session.participants.values());
  const activeCount = activeParticipants.length;
  const total = activeParticipants.reduce((sum, participant) => sum + participant.value, 0);
  const average = activeCount > 0 ? total / activeCount : null;

  if (activeCount > session.current.peakActiveCount) {
    session.current.peakActiveCount = activeCount;
  }

  if (average !== null) {
    session.current.lastAverage = average;
    if (trackSample) {
      session.current.averageSum += average;
      session.current.averageSamples += 1;
    }
  }

  return {
    average,
    averageRounded: average === null ? null : Math.round(average),
    activeCount,
    peakActiveCount: session.current.peakActiveCount
  };
}

function pruneTimeline(session, now = Date.now()) {
  const cutoff = now - TIMELINE_WINDOW_MS;
  session.timeline = session.timeline.filter((point) => point.timestamp >= cutoff);
}

function updateTimeline(session, aggregate, now = Date.now()) {
  pruneTimeline(session, now);

  const bucketTimestamp = now - (now % REBROADCAST_MS);
  const nextPoint = {
    timestamp: bucketTimestamp,
    average: aggregate.average === null ? null : Math.round(aggregate.average),
    activeCount: aggregate.activeCount
  };

  const lastPoint = session.timeline[session.timeline.length - 1];
  if (lastPoint && lastPoint.timestamp === bucketTimestamp) {
    lastPoint.average = nextPoint.average;
    lastPoint.activeCount = nextPoint.activeCount;
    return;
  }

  session.timeline.push(nextPoint);
  pruneTimeline(session, now);
}

function archiveCheckpoint(session, endedAt = Date.now()) {
  const aggregate = calculateAggregate(session, { now: endedAt, trackSample: false });
  const hasData =
    session.current.averageSamples > 0 ||
    session.current.lastAverage !== null ||
    session.current.peakActiveCount > 0 ||
    aggregate.activeCount > 0;

  if (!hasData) {
    return;
  }

  const average =
    session.current.averageSamples > 0
      ? session.current.averageSum / session.current.averageSamples
      : session.current.lastAverage ?? aggregate.average;

  if (average === null) {
    return;
  }

  session.history.push({
    checkpointNumber: session.checkpointNumber,
    average: Math.round(average),
    lastAverage:
      session.current.lastAverage === null ? null : Math.round(session.current.lastAverage),
    peakActiveCount: session.current.peakActiveCount,
    timestampEnded: new Date(endedAt).toISOString()
  });

  if (session.history.length > MAX_HISTORY_ITEMS) {
    session.history.splice(0, session.history.length - MAX_HISTORY_ITEMS);
  }
}

function buildSessionState(sessionId, session, options = {}) {
  const now = options.now ?? Date.now();
  const aggregate = calculateAggregate(session, { ...options, now });
  updateTimeline(session, aggregate, now);
  return {
    sessionId,
    checkpointNumber: session.checkpointNumber,
    average: aggregate.averageRounded,
    averageRaw: aggregate.average,
    activeCount: aggregate.activeCount,
    peakActiveCount: aggregate.peakActiveCount,
    history: session.history.slice(-5),
    timeline: session.timeline.slice()
  };
}

function emitSessionState(sessionId, options = {}) {
  const session = getSession(sessionId);
  const payload = buildSessionState(sessionId, session, options);
  io.to(getRoomName(sessionId)).emit("sessionState", payload);
}

io.on("connection", (socket) => {
  socket.on("joinSession", (payload = {}) => {
    const role = payload.role === "presenter" ? "presenter" : "audience";
    const sessionId = normalizeSessionId(payload.sessionId);
    const participantId =
      role === "audience" ? String(payload.participantId || socket.id) : null;

    if (socket.data.sessionId) {
      socket.leave(getRoomName(socket.data.sessionId));
    }

    socket.join(getRoomName(sessionId));
    socket.data = {
      role,
      sessionId,
      participantId
    };

    const session = getSession(sessionId);
    if (role === "audience" && session.participants.has(participantId)) {
      const participant = session.participants.get(participantId);
      session.participants.set(participantId, {
        ...participant,
        socketId: socket.id,
        disconnectedAt: null
      });
    }
    socket.emit("sessionState", buildSessionState(sessionId, session));
  });

  socket.on("sliderUpdate", (payload = {}) => {
    if (socket.data.role !== "audience" || !socket.data.sessionId || !socket.data.participantId) {
      return;
    }

    const session = getSession(socket.data.sessionId);
    session.participants.set(socket.data.participantId, {
      value: clampValue(payload.value),
      updatedAt: Date.now(),
      socketId: socket.id,
      disconnectedAt: null
    });

    emitSessionState(socket.data.sessionId, { trackSample: true });
  });

  socket.on("resetSession", () => {
    if (socket.data.role !== "presenter" || !socket.data.sessionId) {
      return;
    }

    const session = getSession(socket.data.sessionId);
    resetCurrentCheckpoint(session);
    io.to(getRoomName(socket.data.sessionId)).emit("sessionReset", {
      sessionId: socket.data.sessionId,
      checkpointNumber: session.checkpointNumber
    });
    emitSessionState(socket.data.sessionId);
  });

  socket.on("newCheckpoint", () => {
    if (socket.data.role !== "presenter" || !socket.data.sessionId) {
      return;
    }

    const session = getSession(socket.data.sessionId);
    archiveCheckpoint(session);
    session.checkpointNumber += 1;
    resetCurrentCheckpoint(session);

    io.to(getRoomName(socket.data.sessionId)).emit("checkpointStarted", {
      sessionId: socket.data.sessionId,
      checkpointNumber: session.checkpointNumber
    });
    emitSessionState(socket.data.sessionId);
  });

  socket.on("disconnect", () => {
    if (socket.data.role !== "audience" || !socket.data.sessionId || !socket.data.participantId) {
      return;
    }

    const session = sessions.get(socket.data.sessionId);
    if (!session) {
      return;
    }

    const participant = session.participants.get(socket.data.participantId);
    if (!participant || participant.socketId !== socket.id) {
      return;
    }

    session.participants.set(socket.data.participantId, {
      ...participant,
      socketId: null,
      disconnectedAt: Date.now()
    });
  });
});

setInterval(() => {
  for (const sessionId of sessions.keys()) {
    emitSessionState(sessionId, { trackSample: true });
  }
}, REBROADCAST_MS);

server.listen(PORT, () => {
  console.log(`Clarity meter server listening on http://localhost:${PORT}`);
});
