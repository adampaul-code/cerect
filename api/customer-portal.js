import { createCustomerPortalHandler } from "./lib/customer-portal.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method === "GET") return createCustomerPortalHandler(req, res, "get");
  if (req.method === "POST") return createCustomerPortalHandler(req, res, "post");
  return res.status(405).json({ error: "Method not allowed" });
}