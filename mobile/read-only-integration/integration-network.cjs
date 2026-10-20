'use strict'
// Process-local guard, loaded before Firebase. Never changes B or system networking.
const net = require('node:net'), tls = require('node:tls')
const state = { sockets: [], requests: [], denied: [], firestoreUnavailable: false }
const ports = new Set([9199, 8188])
function reject(destination) {
  state.denied.push(destination)
  throw Object.assign(Error('C2_TEST_NETWORK_DENIED'), { code: 'C2_TEST_NETWORK_DENIED' })
}
function socketDestination(args) {
  if (Array.isArray(args[0])) return socketDestination(args[0])
  const first = args[0]
  if (first && typeof first === 'object' && !first.path)
    return { host: first.host ?? first.hostname ?? 'localhost', port: Number(first.port) }
  if (typeof first === 'number' || /^\d+$/.test(String(first)))
    return { host: typeof args[1] === 'string' ? args[1] : 'localhost', port: Number(first) }
  return { host: 'unsupported', port: 0 }
}
const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const destination = socketDestination(args)
  if (destination.host !== '127.0.0.1' || !ports.has(destination.port)) reject(destination)
  state.sockets.push(destination)
  return connect.apply(this, args)
}
tls.connect = function () { reject({ transport: 'tls' }) }
const fetch = globalThis.fetch
globalThis.fetch = function (input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !ports.has(Number(url.port)))
    reject({ origin: url.origin })
  if (url.port === '8188' && /(?:\/Write\/|:commit|:batchWrite|:importDocuments|:exportDocuments)/i.test(url.pathname))
    reject({ operation: 'firestore-write' })
  // Record no query parameters, tokens, headers or bodies.
  state.requests.push({ origin: url.origin, path: url.pathname, method: options?.method ?? 'GET' })
  if (state.firestoreUnavailable && url.port === '8188')
    return Promise.reject(Error('C2_TEST_ISOLATED_FIRESTORE_OUTAGE'))
  return fetch(input, options)
}
module.exports = state
