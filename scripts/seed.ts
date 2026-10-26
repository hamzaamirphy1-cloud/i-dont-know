import "dotenv/config";
import { randomUUID } from "node:crypto";
import { pool, query, transaction } from "../lib/db";
import { hashPassword } from "../lib/auth";
const samples = [
  [
    "ClinicOS",
    "Healthcare",
    149,
    ["Next.js", "PostgreSQL"],
    "A calmer, smarter way to run your clinic. Patients, appointments, prescriptions and lab reports, together.",
    [
      "Patient registration & records",
      "Doctor schedules & appointments",
      "Digital prescriptions",
      "Lab report management",
    ],
    "mint",
  ],
  [
    "Storefront",
    "E-commerce",
    129,
    ["React", "Node.js"],
    "Turn your next big idea into a beautiful online store. Built for independent businesses.",
    [
      "Product & inventory management",
      "Shopping cart",
      "Order dashboard",
      "Responsive storefront",
    ],
    "peach",
  ],
  [
    "Learnify",
    "Education",
    179,
    ["Next.js", "Supabase"],
    "Your knowledge deserves a home. Launch courses and build a community that loves learning.",
    [
      "Course builder",
      "Student dashboard",
      "Progress tracking",
      "Community discussions",
    ],
    "lavender",
  ],
  [
    "Teamflow",
    "Productivity",
    99,
    ["React", "Express"],
    "Less busywork, more good work. Keep your projects, people and priorities in sync.",
    [
      "Kanban projects",
      "Team workspace",
      "Task assignments",
      "Activity tracking",
    ],
    "blue",
  ],
  [
    "TableTalk",
    "Food & Restaurant",
    139,
    ["Vue", "Node.js"],
    "From the first reservation to the last order. Your restaurant, running beautifully.",
    [
      "Table reservations",
      "Digital menu",
      "Kitchen order queue",
      "Daily sales reports",
    ],
    "yellow",
  ],
  [
    "Nestly",
    "Real Estate",
    159,
    ["Next.js", "MongoDB"],
    "Great spaces find their people. A complete property listing platform, ready for your brand.",
    [
      "Property listings",
      "Search & filters",
      "Agent profiles",
      "Inquiry management",
    ],
    "pink",
  ],
] as const;
try {
  if (process.env.SEED_DEMO !== "true")
    throw Error("Set SEED_DEMO=true only on a local development database.");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw Error("Set SEED_PASSWORD to at least 12 characters.");
  const hash = await hashPassword(password);
  await transaction(async (c) => {
    for (const [email, name, role] of [
      ["admin@vibe96.local", "Alex Morgan", "admin"],
      ["builder@vibe96.local", "Rafi Studio", "builder"],
      ["buyer@vibe96.local", "Karim Ahmed", "buyer"],
    ])
      await c.query(
        "INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING",
        [randomUUID(), email, name, role, hash],
      );
    const seller = (
      await c.query("SELECT id FROM users WHERE email=$1", [
        "builder@vibe96.local",
      ])
    ).rows[0].id;
    for (const [
      name,
      category,
      price,
      tech,
      description,
      features,
      accent,
    ] of samples) {
      const exists = await c.query(
        "SELECT id FROM products WHERE name=$1 AND seller_id=$2",
        [name, seller],
      );
      if (exists.rowCount) {
        await c.query(
          "UPDATE products SET screenshots=$1 WHERE id=$2 AND sample=true AND screenshots='{}'",
          [["/previews/" + name.toLowerCase() + ".svg"], exists.rows[0].id],
        );
        continue;
      }
      await c.query(
        `INSERT INTO products(id,seller_id,name,description,category,technology,features,price_cents,repository,license,status,sample,accent,review_note,screenshots) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',true,$11,$12,$13)`,
        [
          randomUUID(),
          seller,
          name,
          description,
          category,
          [...tech],
          [...features],
          price * 100,
          "https://github.com/example/" + name.toLowerCase(),
          "Sample license: one business installation. Builder retains copyright. Redistribution or resale of source is prohibited. Illustrative terms only; no source artifact is attached.",
          accent,
          "Seeded illustrative listing; not independently audited.",
          ["/previews/" + name.toLowerCase() + ".svg"],
        ],
      );
    }
  });
  console.log(
    "Seed complete: six sample listings and buyer, builder, admin demo accounts. No payments, purchases or audit claims were seeded.",
  );
} finally {
  await pool().end();
}
