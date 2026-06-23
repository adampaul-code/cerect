import { createPublicBookingHandler } from "./lib/public-booking.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method === "GET") return createPublicBookingHandler(req, res, "get");
  if (req.method === "POST") return createPublicBookingHandler(req, res, "post");
  return res.status(405).json({ error: "Method not allowed" });
}