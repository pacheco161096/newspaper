const MAX_TEXT_LENGTH = 4096;
const MAX_CAPTION_LENGTH = 1024;
const MAX_PHOTO_SIZES = 8;
const UNSUPPORTED_MEDIA_KEYS = ['video', 'audio', 'document', 'voice', 'video_note', 'sticker', 'animation'] as const;
const IGNORED_UPDATE_KEYS = [
  'edited_message',
  'channel_post',
  'edited_channel_post',
  'callback_query',
  'inline_query',
  'business_message',
] as const;

export type TelegramTextUpdate = {
  updateId: number;
  messageId: number;
  chatId: string;
  fromId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  text: string;
};

export type TelegramPhotoUpdate = {
  updateId: number;
  messageId: number;
  chatId: string;
  fromId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  caption: string;
  fileId: string;
  mediaGroupId: string | null;
};

export type TelegramCommandUpdate = {
  updateId: number;
  messageId: number;
  chatId: string;
  fromId: string;
  command: 'enviar' | 'cancelar';
};

export type TelegramUpdateParse =
  | { kind: 'text'; update: TelegramTextUpdate }
  | { kind: 'photo'; update: TelegramPhotoUpdate }
  | { kind: 'command'; update: TelegramCommandUpdate }
  | { kind: 'ignore'; updateId: number; reason: string }
  | { kind: 'invalid' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSafeInteger(value: unknown, min: number) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) return null;
  return value;
}

function readBoundedString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

export function readUpdateId(update: unknown) {
  if (!isRecord(update)) return null;
  return readSafeInteger(update.update_id, 0);
}

export function readMessage(update: unknown) {
  if (!isRecord(update) || !isRecord(update.message)) return null;
  return update.message;
}

export function readMessageId(message: unknown) {
  if (!isRecord(message)) return null;
  return readSafeInteger(message.message_id, 1);
}

export function readChatId(message: unknown) {
  if (!isRecord(message) || !isRecord(message.chat)) return null;
  const chatId = readSafeInteger(message.chat.id, 1);
  return chatId === null ? null : String(chatId);
}

export function readFromId(message: unknown) {
  if (!isRecord(message) || !isRecord(message.from)) return null;
  const fromId = readSafeInteger(message.from.id, 1);
  return fromId === null ? null : String(fromId);
}

export function readUsername(message: unknown) {
  if (!isRecord(message) || !isRecord(message.from)) return null;
  return readBoundedString(message.from.username, 64);
}

export function readFirstName(message: unknown) {
  if (!isRecord(message) || !isRecord(message.from)) return null;
  return readBoundedString(message.from.first_name, 128);
}

export function readLastName(message: unknown) {
  if (!isRecord(message) || !isRecord(message.from)) return null;
  return readBoundedString(message.from.last_name, 128);
}

export function readText(message: unknown) {
  if (!isRecord(message) || typeof message.text !== 'string') return null;
  return message.text;
}

export function readCaption(message: unknown) {
  if (!isRecord(message) || typeof message.caption !== 'string') return '';
  return message.caption.replaceAll('\u0000', '').trim();
}

function isFileId(value: string) {
  return /^[\x21-\x7E]{16,512}$/.test(value);
}

export function readLargestPhotoFileId(message: unknown) {
  if (!isRecord(message) || !Array.isArray(message.photo)) return null;
  if (!message.photo.length || message.photo.length > MAX_PHOTO_SIZES) return null;
  let best: { fileId: string; area: number; fileSize: number } | null = null;
  for (const item of message.photo) {
    if (!isRecord(item) || typeof item.file_id !== 'string' || !isFileId(item.file_id)) return null;
    const width = typeof item.width === 'number' && item.width > 0 ? item.width : 0;
    const height = typeof item.height === 'number' && item.height > 0 ? item.height : 0;
    const fileSize = typeof item.file_size === 'number' && item.file_size > 0 ? item.file_size : 0;
    const area = width * height;
    if (!best || area > best.area || (area === best.area && fileSize > best.fileSize)) {
      best = { fileId: item.file_id, area, fileSize };
    }
  }
  return best?.fileId ?? null;
}

export function readMediaGroupId(message: unknown) {
  if (!isRecord(message) || typeof message.media_group_id !== 'string') return null;
  return /^[A-Za-z0-9_-]{1,128}$/.test(message.media_group_id) ? message.media_group_id : null;
}

function ignoredUpdateReason(update: Record<string, unknown>) {
  return IGNORED_UPDATE_KEYS.find((key) => key in update) ?? null;
}

function unsupportedMediaReason(message: Record<string, unknown>) {
  return UNSUPPORTED_MEDIA_KEYS.find((key) => key in message) ?? null;
}

export function parseTelegramUpdate(body: unknown): TelegramUpdateParse {
  if (!isRecord(body)) return { kind: 'invalid' };
  const updateId = readUpdateId(body);
  if (updateId === null) return { kind: 'invalid' };

  const ignored = ignoredUpdateReason(body);
  if (ignored && !isRecord(body.message)) return { kind: 'ignore', updateId, reason: ignored };

  const message = readMessage(body);
  if (!message) return { kind: 'ignore', updateId, reason: 'no_message' };

  const unsupported = unsupportedMediaReason(message);
  if (unsupported) return { kind: 'ignore', updateId, reason: unsupported };

  const chat = isRecord(message.chat) ? message.chat : null;
  if (!chat || chat.type !== 'private') return { kind: 'ignore', updateId, reason: 'not_private' };
  if (isRecord(message.from) && message.from.is_bot === true) return { kind: 'ignore', updateId, reason: 'bot' };

  const messageId = readMessageId(message);
  const chatId = readChatId(message);
  const fromId = readFromId(message);
  if (messageId === null || chatId === null || fromId === null) {
    return { kind: 'ignore', updateId, reason: 'unsupported_message' };
  }

  if ('photo' in message) {
    const fileId = readLargestPhotoFileId(message);
    if (!fileId) return { kind: 'ignore', updateId, reason: 'invalid_photo' };
    const caption = readCaption(message);
    if (caption.length > MAX_CAPTION_LENGTH) return { kind: 'ignore', updateId, reason: 'caption_too_long' };
    return {
      kind: 'photo',
      update: {
        updateId,
        messageId,
        chatId,
        fromId,
        username: readUsername(message),
        firstName: readFirstName(message),
        lastName: readLastName(message),
        caption,
        fileId,
        mediaGroupId: readMediaGroupId(message),
      },
    };
  }

  const text = readText(message);
  if (text === null) return { kind: 'ignore', updateId, reason: 'unsupported_message' };

  const normalized = text.replaceAll('\u0000', '').trim();
  if (!normalized) return { kind: 'ignore', updateId, reason: 'empty_text' };
  const command = normalized.match(/^\/(enviar|cancelar)(?:@[A-Za-z0-9_]+)?(?:\s|$)/i)?.[1]?.toLowerCase();
  if (command === 'enviar' || command === 'cancelar') {
    return { kind: 'command', update: { updateId, messageId, chatId, fromId, command } };
  }
  if (normalized.startsWith('/')) return { kind: 'ignore', updateId, reason: 'command' };
  if (normalized.length > MAX_TEXT_LENGTH) return { kind: 'ignore', updateId, reason: 'text_too_long' };

  return {
    kind: 'text',
    update: {
      updateId,
      messageId,
      chatId,
      fromId,
      username: readUsername(message),
      firstName: readFirstName(message),
      lastName: readLastName(message),
      text: normalized,
    },
  };
}
