'use strict';
const http  = require('http');
const https = require('https');

// Single source of truth for reaching the Python ML service.
// Works with BOTH local "http://host:port" URLs and hosted HTTPS URLs that
// carry no explicit port (e.g. a Hugging Face Space at https://name.hf.space).
// The older inline clients assumed http + port 8000, which silently failed
// against an HTTPS deployment — this picks the transport and default port
// from the URL itself.

const mlServiceUrl = () => process.env.ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Call the ML service and resolve parsed JSON.
 * @param {string} path           e.g. '/predict'
 * @param {object} opts
 * @param {string} [opts.method]  HTTP method (default 'GET')
 * @param {object} [opts.body]    JSON body (POST)
 * @param {number} [opts.timeoutMs]
 * Rejects on network error, timeout, non-2xx, or non-JSON response.
 */
function mlFetch(path, { method = 'GET', body = null, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(path, mlServiceUrl());
    } catch (e) {
      return reject(new Error(`Invalid ML_SERVICE_URL: ${e.message}`));
    }

    const isHttps   = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const payload   = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      timeout:  timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = transport.request(options, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new Error(data.detail || `ML service returned ${res.statusCode}`));
          } else {
            resolve(data);
          }
        } catch {
          reject(new Error(`ML service returned non-JSON: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error',   (err) => reject(new Error(err.message)));
    req.on('timeout', () => { req.destroy(); reject(new Error('ML service request timed out')); });
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { mlFetch };
