// api/review.js
// Vercel serverless (Node). This endpoint accepts POST { binId, identifier, review }
// identifier: an object that will be used to find the worker, e.g. { PhoneNumber: "+91-..." }
// review: { user, rating, comment, date }
// It fetches the bin, finds the worker, appends review to worker.Reviews, and PUTs back the bin.

import fetch from "node-fetch";

const JSONBIN_KEY = process.env.JSONBIN_KEY || "$2a$10$hYBrwcL0SOsoR3zTmxVnneeA/x38c4FxseIjxUswov4lG8Z3SoIrW";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Only POST allowed" });
    return;
  }
  try {
    const body = req.body;
    const { binId, identifier, review } = body;
    if (!binId || !identifier || !review) {
      res.status(400).json({ message: "binId, identifier and review required" });
      return;
    }
    
    const BIN_URL = `https://api.jsonbin.io/v3/b/${binId}/latest`;
    
    // 1) Get current bin content (public read allowed usually)
    const getResp = await fetch(BIN_URL);
    if (!getResp.ok) {
      const text = await getResp.text();
      throw new Error("Failed to GET bin: " + text);
    }
    const getData = await getResp.json();
    const record = getData.record || getData;
    
    // Support if record is array or object with array
    let arr = [];
    if (Array.isArray(record)) arr = record;
    else if (Array.isArray(record.workers)) arr = record.workers;
    else if (Array.isArray(record.data)) arr = record.data;
    else {
      // if it's an object but not containing array, try to use record directly
      throw new Error("Bin format not recognized: expected array or 'workers' array");
    }
    
    // find worker index by matching fields in identifier
    const idx = arr.findIndex(item => {
      return Object.keys(identifier).every(k => {
        const a = String(item[k] || "").trim().toLowerCase();
        const b = String(identifier[k] || "").trim().toLowerCase();
        return a === b;
      });
    });
    
    if (idx === -1) {
      res.status(404).json({ message: "Worker not found to append review" });
      return;
    }
    
    // Ensure Reviews array exists
    if (!Array.isArray(arr[idx].Reviews)) arr[idx].Reviews = [];
    arr[idx].Reviews.push(review);
    
    // Prepare new content for PUT. If original record was array, we PUT array; if original had 'workers' property, keep structure.
    let newRecord;
    if (Array.isArray(record)) {
      newRecord = arr;
    } else if (Array.isArray(record.workers)) {
      newRecord = { ...record, workers: arr };
    } else if (Array.isArray(record.data)) {
      newRecord = { ...record, data: arr };
    } else {
      newRecord = arr;
    }
    
    // 2) PUT updated bin back
    const putUrl = `https://api.jsonbin.io/v3/b/${binId}`;
    const putResp = await fetch(putUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_KEY,
        "X-Bin-Versioning": "false" // optional
      },
      body: JSON.stringify(newRecord)
    });
    
    if (!putResp.ok) {
      const t = await putResp.text();
      throw new Error("Failed to PUT bin: " + t);
    }
    
    const putResult = await putResp.json();
    res.status(200).json({ ok: true, putResult });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Server error" });
  }
                          }
