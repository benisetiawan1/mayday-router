import { encodeField, decodeMessage } from "./cursorProtobuf.js";

const LEN = 2;
const VARINT = 0;
const FIXED64 = 1;
const VALUE = { NULL: 1, NUMBER: 2, STRING: 3, BOOL: 4, STRUCT: 5, LIST: 6 };
const textDecoder = new TextDecoder();

function concatArrays(...arrays) {
  const result = new Uint8Array(arrays.reduce((sum, array) => sum + array.length, 0));
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

export function encodeAgentValue(value) {
  if (value === null || value === undefined) return encodeField(VALUE.NULL, VARINT, 0);
  if (typeof value === "number") return encodeField(VALUE.NUMBER, FIXED64, value);
  if (typeof value === "string") return encodeField(VALUE.STRING, LEN, value);
  if (typeof value === "boolean") return encodeField(VALUE.BOOL, VARINT, value ? 1 : 0);
  if (Array.isArray(value)) {
    return encodeField(VALUE.LIST, LEN, concatArrays(...value.map((item) => encodeField(1, LEN, encodeAgentValue(item)))));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).map(([key, item]) => encodeField(1, LEN,
      concatArrays(encodeField(1, LEN, key), encodeField(2, LEN, encodeAgentValue(item)))
    ));
    return encodeField(VALUE.STRUCT, LEN, concatArrays(...entries));
  }
  return encodeField(VALUE.STRING, LEN, String(value));
}

export function decodeAgentValue(data) {
  const fields = decodeMessage(data);
  if (fields.has(VALUE.NULL)) return null;
  if (fields.has(VALUE.NUMBER)) {
    const bytes = fields.get(VALUE.NUMBER)[0].value;
    return new DataView(bytes.buffer, bytes.byteOffset, 8).getFloat64(0, true);
  }
  if (fields.has(VALUE.STRING)) return textDecoder.decode(fields.get(VALUE.STRING)[0].value);
  if (fields.has(VALUE.BOOL)) return fields.get(VALUE.BOOL)[0].value !== 0;
  if (fields.has(VALUE.STRUCT)) {
    const result = {};
    for (const entry of decodeMessage(fields.get(VALUE.STRUCT)[0].value).get(1) || []) {
      const pair = decodeMessage(entry.value);
      result[textDecoder.decode(pair.get(1)[0].value)] = decodeAgentValue(pair.get(2)[0].value);
    }
    return result;
  }
  if (fields.has(VALUE.LIST)) {
    return (decodeMessage(fields.get(VALUE.LIST)[0].value).get(1) || []).map((item) => decodeAgentValue(item.value));
  }
  return undefined;
}

export function encodeMcpToolDefinition(tool) {
  const fn = tool?.function || tool || {};
  const name = fn.name || tool?.name || "";
  const description = fn.description || tool?.description || "";
  const schema = fn.parameters || tool?.inputSchema || tool?.input_schema || {};
  return concatArrays(
    encodeField(1, LEN, name),
    ...(description ? [encodeField(2, LEN, description)] : []),
    encodeField(3, LEN, encodeAgentValue(schema)),
    encodeField(4, LEN, "9router"),
    encodeField(5, LEN, name)
  );
}

export function encodeMcpTools(tools = []) {
  return concatArrays(...tools.map((tool) => encodeField(1, LEN, encodeMcpToolDefinition(tool))));
}

export function decodeMcpArgs(data) {
  const fields = decodeMessage(data);
  const args = {};
  for (const entry of fields.get(2) || []) {
    const pair = decodeMessage(entry.value);
    args[textDecoder.decode(pair.get(1)[0].value)] = decodeAgentValue(pair.get(2)[0].value);
  }
  return {
    name: textDecoder.decode(fields.get(1)?.[0]?.value || new Uint8Array()),
    toolName: textDecoder.decode(fields.get(5)?.[0]?.value || new Uint8Array()),
    toolCallId: textDecoder.decode(fields.get(3)?.[0]?.value || new Uint8Array()),
    args,
  };
}

function encodeMcpContentItem(item) {
  if (item?.image || item?.data) {
    const image = item.image || item;
    return encodeField(2, LEN, concatArrays(
      encodeField(1, LEN, image.data),
      encodeField(2, LEN, image.mimeType || "application/octet-stream")
    ));
  }
  return encodeField(1, LEN, encodeField(1, LEN, item?.text ?? String(item ?? "")));
}

export function encodeMcpResultSuccess({ textItems = [], imageItems = [], isError = false } = {}) {
  const items = [
    ...textItems.map((text) => encodeField(1, LEN, encodeMcpContentItem({ text }))),
    ...imageItems.map((image) => encodeField(1, LEN, encodeMcpContentItem({ image }))),
  ];
  return encodeField(1, LEN, concatArrays(...items, encodeField(2, VARINT, isError ? 1 : 0)));
}

export function encodeMcpResultError(message) {
  return encodeField(2, LEN, encodeField(1, LEN, message));
}

export function encodeMcpResultToolNotFound(name) {
  return encodeField(5, LEN, encodeField(1, LEN, name));
}
