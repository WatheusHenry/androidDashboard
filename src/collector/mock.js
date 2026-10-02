'use strict';

// Deterministic-ish fake data for developing/testing the dashboard
// without an Android device. Enabled with --mock or MOCK_DATA=1.

const drift = (base, amp) => base + (Math.random() - 0.5) * 2 * amp;
const GB = 1024 ** 3;
const started = Date.now();

function mockSystem() {
  return {
    available: true,
    model: 'Mock Phone X',
    manufacturer: 'MockMaker',
    brand: 'mock',
    androidVersion: '11',
    sdkLevel: 30,
    kernelVersion: '4.14.180-mock',
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cpuCores: 4,
    isTermux: true,
    uptimeSec: Math.round((Date.now() - started) / 1000 + 3600 * 50),
    uptime: '2d 2h',
    mock: true,
  };
}

function mockCpu() {
  return { available: true, usagePercent: Math.round(drift(32, 20) * 10) / 10, cores: 4, loadAverage: { '1m': drift(1.2, 0.8), '5m': drift(1.0, 0.5), '15m': drift(0.9, 0.3) }, mock: true };
}

function mockMemory() {
  const total = 2.8 * GB;
  const used = drift(1.4, 0.2) * GB;
  const swapTotal = 1.4 * GB;
  const swapUsed = drift(0.4, 0.1) * GB;
  return {
    available: true,
    totalBytes: total,
    usedBytes: used,
    availableBytes: total - used,
    usagePercent: (used / total) * 100,
    totalGB: total / GB,
    usedGB: used / GB,
    availableGB: (total - used) / GB,
    swapTotalBytes: swapTotal,
    swapUsedBytes: swapUsed,
    swapTotalGB: swapTotal / GB,
    swapUsedGB: swapUsed / GB,
    swapUsagePercent: (swapUsed / swapTotal) * 100,
    mock: true,
  };
}

function mockStorage() {
  const total = 17 * GB;
  const used = drift(5, 0.1) * GB;
  const primary = {
    path: '/data',
    totalBytes: total,
    usedBytes: used,
    availableBytes: total - used,
    usagePercent: (used / total) * 100,
    totalGB: total / GB,
    usedGB: used / GB,
    availableGB: (total - used) / GB,
  };
  return { available: true, primary, mounts: {}, mock: true };
}

function mockBattery() {
  const pct = Math.round(drift(78, 4));
  return {
    available: true,
    percentage: pct,
    status: pct < 20 ? 'charging' : 'discharging',
    charging: pct < 20,
    temperatureC: Math.round(drift(31.2, 1.5) * 10) / 10,
    health: 'good',
    powerSource: pct < 20 ? 'ac' : null,
    present: true,
    mock: true,
  };
}

function mockNetwork() {
  return {
    available: true,
    ip: '192.168.0.42',
    interface: 'wlan0',
    hostname: 'mockphone',
    connected: true,
    interfaces: [{ interface: 'wlan0', ip: '192.168.0.42' }],
    mock: true,
  };
}

module.exports = { mockSystem, mockCpu, mockMemory, mockStorage, mockBattery, mockNetwork };
