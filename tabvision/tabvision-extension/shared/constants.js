export const STATES = Object.freeze({
  IDLE: "IDLE",
  CAPTURING: "CAPTURING",
  ANALYZING: "ANALYZING",
  TYPING: "TYPING",
  PAUSED: "PAUSED",
  ERROR: "ERROR"
});

export const DEFAULT_CONFIG = Object.freeze({
  apiUrl: "http://127.0.0.1:8000/api",
  consentToSend: false,
  typingSpeed: "medium",
  inactivityThreshold: 22500,
  autoResume: true,
  showNotifications: true,
  typingMode: "type"
});

export const SPEED_RANGES = Object.freeze({
  slow: [100, 200],
  medium: [50, 150],
  fast: [20, 80]
});

export const CONFIDENCE_THRESHOLD = 0.7;
export const INACTIVITY_ALARM = "tabvision-inactivity-timer";

export const MESSAGE_TYPES = Object.freeze({
  START_CAPTURE: "START_CAPTURE",
  STOP_ALL: "STOP_ALL",
  GET_STATE: "GET_STATE",
  STATE_UPDATE: "STATE_UPDATE",
  PREPROCESS_AND_ANALYZE: "PREPROCESS_AND_ANALYZE",
  TYPE_ANSWER: "TYPE_ANSWER",
  STOP_TYPING: "STOP_TYPING",
  USER_INTERACTION: "USER_INTERACTION",
  TYPING_PROGRESS: "TYPING_PROGRESS",
  TYPING_COMPLETE: "TYPING_COMPLETE",
  TYPING_PAUSED: "TYPING_PAUSED",
  NO_INPUT_FOCUSED: "NO_INPUT_FOCUSED",
  READONLY_INPUT: "READONLY_INPUT",
  PASSWORD_INPUT: "PASSWORD_INPUT",
  CONTENT_SCRIPT_UNAVAILABLE: "CONTENT_SCRIPT_UNAVAILABLE"
});
