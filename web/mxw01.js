/* Dependency-free MXW01 Web Bluetooth driver. See README.md for protocol sources. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ElectroCatMXW01 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRINTER_WIDTH = 384;
  const BYTES_PER_ROW = PRINTER_WIDTH / 8;
  const MAX_INTENSITY = 0xc0;
  const UUIDS = Object.freeze({
    advertisedService: '0000af30-0000-1000-8000-00805f9b34fb',
    service: '0000ae30-0000-1000-8000-00805f9b34fb',
    control: '0000ae01-0000-1000-8000-00805f9b34fb',
    notify: '0000ae02-0000-1000-8000-00805f9b34fb',
    data: '0000ae03-0000-1000-8000-00805f9b34fb'
  });
  const COMMAND = Object.freeze({status: 0xa1, intensity: 0xa2, feed: 0xa3,
    print: 0xa9, complete: 0xaa, flush: 0xad});
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function crc8(bytes, initial = 0) {
    let crc = initial & 0xff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) {
        crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
      }
    }
    return crc;
  }

  function commandFrame(command, payload = []) {
    const data = Uint8Array.from(payload);
    const frame = new Uint8Array(data.length + 8);
    frame.set([0x22, 0x21, command & 0xff, 0x00, data.length & 0xff,
      (data.length >> 8) & 0xff]);
    frame.set(data, 6);
    frame[6 + data.length] = crc8(data);
    frame[7 + data.length] = 0xff;
    return frame;
  }

  function bytesFromView(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof DataView) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return Uint8Array.from(value || []);
  }

  function parseNotification(value) {
    const bytes = bytesFromView(value);
    if (bytes.length < 7 || bytes[0] !== 0x22 || bytes[1] !== 0x21) return null;
    const length = bytes[4] | (bytes[5] << 8);
    if (bytes.length < 6 + length) return null;
    return {command: bytes[2], payload: bytes.slice(6, 6 + length)};
  }

  function canvasToRaster(canvas, threshold = 128) {
    if (!canvas || canvas.width !== PRINTER_WIDTH) {
      throw new Error(`MXW01 labels must be exactly ${PRINTER_WIDTH} pixels wide.`);
    }
    const context = canvas.getContext('2d', {willReadFrequently: true});
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const raster = new Uint8Array(canvas.height * BYTES_PER_ROW);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < PRINTER_WIDTH; x++) {
        const pixel = (y * PRINTER_WIDTH + x) * 4;
        const luminance = (pixels[pixel] * 299 + pixels[pixel + 1] * 587 +
          pixels[pixel + 2] * 114) / 1000;
        if (pixels[pixel + 3] > 0 && luminance < threshold) {
          raster[y * BYTES_PER_ROW + (x >> 3)] |= 1 << (x & 7);
        }
      }
    }
    return raster;
  }

  class MXW01Printer {
    constructor(options = {}) {
      this.bluetooth = options.bluetooth || (typeof navigator !== 'undefined' ? navigator.bluetooth : null);
      this.onState = options.onState || (() => {});
      this.paceMs = options.paceMs == null ? 15 : Math.max(0, options.paceMs);
      this.device = null;
      this.control = null;
      this.notify = null;
      this.data = null;
      this.waiters = new Map();
      this._handleNotification = this._handleNotification.bind(this);
      this._handleDisconnect = this._handleDisconnect.bind(this);
    }

    get connected() {
      return Boolean(this.device?.gatt?.connected && this.control && this.notify && this.data);
    }

    async connect() {
      if (!this.bluetooth) {
        throw new Error('Web Bluetooth is unavailable. Use Chrome or Edge on localhost/HTTPS.');
      }
      this.onState({state: 'connecting'});
      if (!this.device) {
        this.device = await this.bluetooth.requestDevice({
          filters: [
            {namePrefix: 'MXW01'},
            {services: [UUIDS.advertisedService]},
            {services: [UUIDS.service]}
          ],
          optionalServices: [UUIDS.service, UUIDS.advertisedService]
        });
        this.device.addEventListener('gattserverdisconnected', this._handleDisconnect);
      }
      if (!this.device.gatt) throw new Error('The selected device has no Bluetooth GATT server.');
      const server = await this.device.gatt.connect();
      let service;
      try {
        service = await server.getPrimaryService(UUIDS.service);
      } catch (_) {
        service = await server.getPrimaryService(UUIDS.advertisedService);
      }
      this.control = await service.getCharacteristic(UUIDS.control);
      this.notify = await service.getCharacteristic(UUIDS.notify);
      this.data = await service.getCharacteristic(UUIDS.data);
      this.notify.addEventListener('characteristicvaluechanged', this._handleNotification);
      await this.notify.startNotifications();
      this.onState({state: 'connected', name: this.device.name || 'MXW01'});
      return this.device.name || 'MXW01';
    }

    disconnect() {
      if (this.device?.gatt?.connected) this.device.gatt.disconnect();
      else this._handleDisconnect();
    }

    _handleDisconnect() {
      this.control = this.notify = this.data = null;
      for (const waiter of this.waiters.values()) waiter.cancel(new Error('Printer disconnected.'));
      this.waiters.clear();
      this.onState({state: 'disconnected'});
    }

    _handleNotification(event) {
      const parsed = parseNotification(event.target.value);
      if (!parsed) return;
      const waiter = this.waiters.get(parsed.command);
      if (!waiter) return;
      this.waiters.delete(parsed.command);
      waiter.resolve(parsed.payload);
    }

    _waitFor(command, timeoutMs) {
      const old = this.waiters.get(command);
      if (old) old.cancel(new Error(`A command 0x${command.toString(16)} is already pending.`));
      let timer;
      let resolvePromise;
      let rejectPromise;
      const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
      const waiter = {
        resolve: payload => {
          clearTimeout(timer);
          resolvePromise(payload);
        },
        cancel: error => {
          clearTimeout(timer);
          if (this.waiters.get(command) === waiter) this.waiters.delete(command);
          rejectPromise(error);
        }
      };
      timer = setTimeout(() => waiter.cancel(
        new Error(`Printer did not answer command 0x${command.toString(16).toUpperCase()}.`)), timeoutMs);
      this.waiters.set(command, waiter);
      return {promise, cancel: waiter.cancel};
    }

    async _write(characteristic, bytes) {
      if (!characteristic) throw new Error('MXW01 is not connected.');
      if (typeof characteristic.writeValueWithoutResponse === 'function') {
        return characteristic.writeValueWithoutResponse(bytes);
      }
      return characteristic.writeValue(bytes);
    }

    async _send(command, payload) {
      await this._write(this.control, commandFrame(command, payload));
    }

    async _request(command, payload, timeoutMs = 5000) {
      const waiting = this._waitFor(command, timeoutMs);
      try {
        await this._send(command, payload);
        return await waiting.promise;
      } catch (error) {
        const ignored = waiting.promise.catch(() => {});
        waiting.cancel(error);
        await ignored;
        throw error;
      }
    }

    async status() {
      const payload = await this._request(COMMAND.status, [0x00]);
      const legacyError = payload.length >= 14 && payload[12] !== 0 ? payload[13] : null;
      const paperCode = payload.length >= 10 ? payload[9] : 0;
      return {payload, legacyError, paperCode};
    }

    async printCanvas(canvas, options = {}) {
      return this.printRaster(canvasToRaster(canvas), canvas.height, options);
    }

    async printRaster(raster, height, options = {}) {
      if (!this.connected) throw new Error('Connect the MXW01 before printing.');
      if (!(raster instanceof Uint8Array) || raster.length !== height * BYTES_PER_ROW) {
        throw new Error(`Raster data must contain exactly ${BYTES_PER_ROW} bytes per line.`);
      }
      const intensity = Number(options.intensity == null ? 0x5d : options.intensity);
      if (!Number.isInteger(intensity) || intensity < 0 || intensity > MAX_INTENSITY) {
        throw new Error(`Print intensity must be an integer from 0 to ${MAX_INTENSITY}.`);
      }
      const onProgress = options.onProgress || (() => {});
      onProgress(0);
      await this._send(COMMAND.intensity, [intensity]);
      const status = await this.status();
      if (status.paperCode === 0x07 || status.legacyError === 1 || status.legacyError === 9) {
        throw new Error('MXW01 reports that paper is missing or the cover is open.');
      }
      if (status.legacyError != null) {
        throw new Error(`MXW01 status error ${status.legacyError}.`);
      }

      const accepted = await this._request(COMMAND.print,
        [height & 0xff, (height >> 8) & 0xff, 0x30, 0x01]);
      if (!accepted.length || accepted[0] !== 0) {
        throw new Error(`MXW01 rejected the print job (${accepted[0] ?? 'no status'}).`);
      }

      let expectedCrc = 0;
      let pace = this.paceMs;
      for (let y = 0; y < height; y++) {
        const row = raster.subarray(y * BYTES_PER_ROW, (y + 1) * BYTES_PER_ROW);
        let sent = false;
        for (let attempt = 0; attempt < 6 && !sent; attempt++) {
          try {
            await this._write(this.data, row);
            sent = true;
          } catch (error) {
            if (attempt === 5) throw error;
            pace = Math.min(45, pace + 5);
            await sleep(pace * (attempt + 1));
          }
        }
        expectedCrc = crc8(row, expectedCrc);
        onProgress(Math.round(((y + 1) / height) * 90));
        if (pace) await sleep(pace);
      }

      const complete = this._waitFor(COMMAND.complete, Math.max(20000, height * 80));
      try {
        await this._send(COMMAND.flush, [0x00]);
      } catch (error) {
        const ignored = complete.promise.catch(() => {});
        complete.cancel(error);
        await ignored;
        throw error;
      }
      const result = await complete.promise;
      if (result.length >= 3 && result[1] === result[2] && result[1] !== expectedCrc) {
        throw new Error('MXW01 image checksum mismatch; the label may be incomplete.');
      }
      const feedLines = Math.max(0, Math.min(255, Number(options.feedLines ?? 0) || 0));
      if (feedLines) await this._send(COMMAND.feed, [feedLines, 0x00]);
      onProgress(100);
      return {height, bytes: raster.length, checksum: expectedCrc};
    }
  }

  return {PRINTER_WIDTH, BYTES_PER_ROW, MAX_INTENSITY, UUIDS, COMMAND,
    crc8, commandFrame, parseNotification, canvasToRaster, MXW01Printer};
});
