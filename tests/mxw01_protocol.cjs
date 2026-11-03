const assert = require('node:assert/strict');
const {
  PRINTER_WIDTH, BYTES_PER_ROW, MAX_INTENSITY, UUIDS, COMMAND,
  crc8, commandFrame, parseNotification, canvasToRaster, MXW01Printer
} = require('../web/mxw01.js');

function notification(command, payload) {
  const bytes = new Uint8Array(7 + payload.length);
  bytes.set([0x22, 0x21, command, 0x00, payload.length & 0xff, payload.length >> 8]);
  bytes.set(payload, 6);
  bytes[bytes.length - 1] = 0x00;
  return bytes;
}

class FakeCharacteristic {
  constructor(write) {
    this.write = write;
    this.listeners = new Map();
  }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  async startNotifications() { return this; }
  async writeValueWithoutResponse(value) { if (this.write) this.write(Uint8Array.from(value)); }
  async writeValue(value) { return this.writeValueWithoutResponse(value); }
  emit(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.listeners.get('characteristicvaluechanged')?.({target: {value: view}});
  }
}

async function testProtocolAndTransport() {
  assert.equal(PRINTER_WIDTH, 384);
  assert.equal(BYTES_PER_ROW, 48);
  assert.equal(MAX_INTENSITY, 192);
  assert.equal(crc8(Uint8Array.of(0x5d)), 0x94);
  assert.deepEqual(Array.from(commandFrame(COMMAND.intensity, [0x5d])),
    [0x22, 0x21, 0xa2, 0x00, 0x01, 0x00, 0x5d, 0x94, 0xff]);

  const wrapped = new Uint8Array([0xee, ...notification(COMMAND.print, [0x00]), 0xee]);
  const parsed = parseNotification(new DataView(wrapped.buffer, 1, wrapped.length - 2));
  assert.equal(parsed.command, COMMAND.print);
  assert.deepEqual(Array.from(parsed.payload), [0]);
  assert.equal(parseNotification(Uint8Array.of(1, 2, 3)), null);

  const rgba = new Uint8ClampedArray(PRINTER_WIDTH * 2 * 4).fill(255);
  for (const x of [0, 7]) rgba.fill(0, x * 4, x * 4 + 3);
  const secondRowX8 = (PRINTER_WIDTH + 8) * 4;
  rgba.fill(0, secondRowX8, secondRowX8 + 3);
  const canvas = {width: PRINTER_WIDTH, height: 2,
    getContext: () => ({getImageData: () => ({data: rgba})})};
  const raster = canvasToRaster(canvas);
  assert.equal(raster.length, 96);
  assert.equal(raster[0], 0x81, 'leftmost pixel must occupy the least-significant bit');
  assert.equal(raster[BYTES_PER_ROW + 1], 0x01);

  const dataRows = [];
  let notify;
  const controlCommands = [];
  const control = new FakeCharacteristic(bytes => {
    controlCommands.push(bytes);
    const command = bytes[2];
    if (command === COMMAND.status) notify.emit(notification(command, new Uint8Array(10)));
    if (command === COMMAND.print) notify.emit(notification(command, Uint8Array.of(0)));
    if (command === COMMAND.flush) {
      const checksum = crc8(Uint8Array.from(dataRows.flatMap(row => Array.from(row))));
      notify.emit(notification(COMMAND.complete, Uint8Array.of(0, checksum, checksum)));
    }
  });
  notify = new FakeCharacteristic();
  const data = new FakeCharacteristic(bytes => dataRows.push(bytes));
  const service = {getCharacteristic: async uuid => ({
    [UUIDS.control]: control, [UUIDS.notify]: notify, [UUIDS.data]: data
  })[uuid]};
  const disconnectListeners = [];
  const device = {
    name: 'MXW01-TEST',
    addEventListener: (name, callback) => disconnectListeners.push({name, callback}),
    gatt: {
      connected: false,
      connect: async function () { this.connected = true; return this; },
      disconnect: function () {
        this.connected = false;
        for (const item of disconnectListeners) if (item.name === 'gattserverdisconnected') item.callback();
      },
      getPrimaryService: async uuid => {
        assert.equal(uuid, UUIDS.service);
        return service;
      }
    }
  };
  let chooserOptions;
  const bluetooth = {requestDevice: async options => { chooserOptions = options; return device; }};
  const states = [];
  const printer = new MXW01Printer({bluetooth, paceMs: 0, onState: event => states.push(event.state)});
  assert.equal(await printer.connect(), 'MXW01-TEST');
  assert(chooserOptions.filters.some(filter => filter.services?.includes(UUIDS.advertisedService)));
  assert(chooserOptions.optionalServices.includes(UUIDS.service));
  assert.equal(printer.connected, true);

  const progress = [];
  const result = await printer.printRaster(raster, 2,
    {intensity: 75, feedLines: 0, onProgress: value => progress.push(value)});
  assert.equal(result.bytes, 96);
  assert.equal(dataRows.length, 2);
  assert.equal(controlCommands[0][2], COMMAND.intensity);
  assert.equal(controlCommands[0][6], 75);
  assert.deepEqual(controlCommands.map(frame => frame[2]),
    [COMMAND.intensity, COMMAND.status, COMMAND.print, COMMAND.flush]);
  assert.equal(progress.at(-1), 100);
  printer.disconnect();
  assert.equal(printer.connected, false);
  assert.deepEqual(states, ['connecting', 'connected', 'disconnected']);
}

testProtocolAndTransport().then(() => {
  console.log('PASS: MXW01 framing, CRC, raster packing, BLE discovery, print flow, and disconnect.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
