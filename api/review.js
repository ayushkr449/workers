// api/review.js
// Vercel serverless Node function (ESM).
// Handles GET -> returns workers array
// Handles POST -> append review to matching worker, PUT updated bin
//
// Required env: JSONBIN_API_KEY, JSONBIN_BIN_ID

import fetch from "node-fetch";

const JSONBIN_KEY = process.env.JSONBIN_API_KEY;
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;

export default async function handler(req, res) {
  // basic checks
  if (!JSONBIN_KEY || !JSONBIN_BIN_ID) {
    res.status(500).json({ ok: false, message: "Server misconfigured: JSONBIN_API_KEY or JSONBIN_BIN_ID not set." });
    return;
  }

  const BIN_LATEST_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`;
  const BIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

  try {
    if (req.method === "GET") {
      // Read bin content and return array/object
      const getResp = await fetch(BIN_LATEST_URL);
      if (!getResp.ok) {
        const text = await getResp.text();
        throw new Error("Failed to GET bin: " + text);
      }
      const getData = await getResp.json();
      const record = getData.record || getData;
      // Return clean payload
      res.status(200).json({ ok: true, data: record });
      return;
    }

    if (req.method === "POST") {
      // Expect body: { identifier: {...}, review: {...} }
      const body = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
      const { identifier, review } = body;
      if (!identifier || !review) {
        res.status(400).json({ ok: false, message: "identifier and review are required in request body." });
        return;
      }

      // 1) GET current bin
      const getResp = await fetch(BIN_LATEST_URL);
      if (!getResp.ok) {
        const t = await getResp.text();
        throw new Error("Failed to GET bin before updating: " + t);
      }
      const getData = await getResp.json();
      const record = getData.record || getData;

      // find array in record
      let arr = [];
      let containerType = "array"; // or 'workers' or 'data'
      if (Array.isArray(record)) {
        arr = record;
        containerType = "array";
      } else if (Array.isArray(record.workers)) {
        arr = record.workers;
        containerType = "workers";
      } else if (Array.isArray(record.data)) {
        arr = record.data;
        containerType = "data";
      } else {
        // no known array - try to error
        throw new Error("Bin format not recognized: expected top-level array or property 'workers'/'data' containing array.");
      }

      // find index by matching all keys in identifier (case-insensitive)
      const idx = arr.findIndex(item => {
        return Object.keys(identifier).every(k => {
          const a = String(item[k] || "").trim().toLowerCase();
          const b = String(identifier[k] || "").trim().toLowerCase();
          return a === b;
        });
      });

      if (idx === -1) {
        res.status(404).json({ ok: false, message: "Worker not found to append review (identifier mismatch)." });
        return;
      }

      // ensure Reviews array exists
      if (!Array.isArray(arr[idx].Reviews)) arr[idx].Reviews = [];
      arr[idx].Reviews.push(review);

      // prepare newRecord based on containerType
      let newRecord;
      if (containerType === "array") newRecord = arr;
      else if (containerType === "workers") newRecord = { ...record, workers: arr };
      else if (containerType === "data") newRecord = { ...record, data: arr };

      // PUT updated content
      const putResp = await fetch(BIN_URL, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": JSONBIN_KEY
        },
        body: JSON.stringify(newRecord)
      });

      if (!putResp.ok) {
        const t = await putResp.text();
        throw new Error("Failed to PUT bin: " + t);
      }

      const putResult = await putResp.json();
      res.status(200).json({ ok: true, putResult });
      return;
    }

    // other methods
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ ok: false, message: "Method not allowed" });
  } catch (err) {
    console.error("API/review error:", err);
    res.status(500).json({ ok: false, message: err.message || "Server error" });
  }
}
