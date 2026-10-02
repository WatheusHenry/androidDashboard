'use strict';

const os = require('os');

// Network via Node's os.networkInterfaces() — no shell commands.
function collectNetwork() {
  try {
    const ifaces = os.networkInterfaces();
    const list = [];

    for (const [name, addrs] of Object.entries(ifaces)) {
      for (const a of addrs || []) {
        if (a.family !== 'IPv4' || a.internal) continue;
        list.push({ interface: name, ip: a.address, netmask: a.netmask });
      }
    }

    // Prefer typical Android wifi (wlan*/ap*) and mobile (rmnet*) interfaces.
    const byPrefix = (re) => list.find((e) => re.test(e.interface));
    const primary = byPrefix(/^(wlan|ap|swlan)/) || byPrefix(/^rmnet/) || list[0] || null;

    if (!primary) {
      return { available: false, reason: 'no external IPv4 interface found', hostname: os.hostname(), interfaces: list };
    }

    return {
      available: true,
      ip: primary.ip,
      interface: primary.interface,
      hostname: os.hostname(),
      connected: true,
      interfaces: list.map(({ interface: i, ip }) => ({ interface: i, ip })),
    };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}

module.exports = { collectNetwork };
