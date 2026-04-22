export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// AI Coach timeout constants
export const WHISPER_TIMEOUT_MS = 900_000;       // 15 minutes
export const LLM_TIMEOUT_MS = 900_000;           // 15 minutes
export const SERVER_TIMEOUT_MS = 2_100_000;      // 35 minutes
export const MAX_AUDIO_FILE_SIZE = 200 * 1024 * 1024;  // 200MB
export const WHISPER_CHUNK_SIZE = 24 * 1024 * 1024;    // 24MB (Whisper limit is 25MB)
