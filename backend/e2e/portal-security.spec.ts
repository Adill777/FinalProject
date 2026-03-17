import { expect, test } from "@playwright/test";
import crypto from "crypto";

const apiBase = process.env.E2E_API_BASE_URL || "http://localhost:3000";
const shouldRun = process.env.E2E_RUN === "true";

const base32Decode = (input: string): Buffer => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  const cleaned = input.replace(/=+$/g, "").toUpperCase();
  for (const char of cleaned) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
};

const generateTotp = (base32Secret: string, timeStep = 30): string => {
  const secret = base32Decode(base32Secret);
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
};

const parseApi = <T>(payload: unknown): T => {
  if (!payload || typeof payload !== "object") return {} as T;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.success === "boolean" && typeof obj.data === "object" && obj.data) {
    return obj.data as T;
  }
  return obj as T;
};

test.describe.configure({ mode: "serial" });

test.describe("Portal security e2e", () => {
  test.skip(!shouldRun, "Set E2E_RUN=true to execute security e2e flows.");

  test("upload -> request -> approve -> decrypt -> delete + negative paths", async ({ request }) => {
    const seed = Date.now().toString(36);
    const adminEmail = `admin.${seed}@example.com`;
    const userEmail = `user.${seed}@example.com`;
    const attackerEmail = `attacker.${seed}@example.com`;
    const password = "Passw0rd!Secure";

    const signupAdmin = await request.post(`${apiBase}/api/admin/`, {
      data: { firstname: "Admin", lastname: "E2E", email: adminEmail, password }
    });
    expect([200, 409]).toContain(signupAdmin.status());

    const signupUser = await request.post(`${apiBase}/api/user/`, {
      data: { firstname: "User", lastname: "E2E", email: userEmail, password }
    });
    expect([200, 409]).toContain(signupUser.status());

    const signupAttacker = await request.post(`${apiBase}/api/user/`, {
      data: { firstname: "Attacker", lastname: "E2E", email: attackerEmail, password }
    });
    expect([200, 409]).toContain(signupAttacker.status());

    const adminLoginRes = await request.post(`${apiBase}/api/admin/login`, {
      data: { email: adminEmail, password }
    });
    expect(adminLoginRes.ok()).toBeTruthy();
    const adminLogin = parseApi<{ accessToken?: string }>(await adminLoginRes.json());
    const adminAccess = String(adminLogin.accessToken || "");
    expect(adminAccess.length).toBeGreaterThan(20);

    const userLoginRes = await request.post(`${apiBase}/api/user/login`, {
      data: { email: userEmail, password }
    });
    expect(userLoginRes.ok()).toBeTruthy();
    const userLogin = parseApi<{ accessToken?: string }>(await userLoginRes.json());
    const userAccess = String(userLogin.accessToken || "");
    expect(userAccess.length).toBeGreaterThan(20);

    const attackerLoginRes = await request.post(`${apiBase}/api/user/login`, {
      data: { email: attackerEmail, password }
    });
    expect(attackerLoginRes.ok()).toBeTruthy();
    const attackerLogin = parseApi<{ accessToken?: string }>(await attackerLoginRes.json());
    const attackerAccess = String(attackerLogin.accessToken || "");

    const user2faRes = await request.post(`${apiBase}/api/user/generate-2fa`, {
      headers: { Authorization: `Bearer ${userAccess}` },
      data: {}
    });
    expect(user2faRes.ok()).toBeTruthy();
    const user2fa = parseApi<{ secret?: string }>(await user2faRes.json());
    const totpSecret = String(user2fa.secret || "");
    expect(totpSecret.length).toBeGreaterThan(10);

    const keyGenRes = await request.post(`${apiBase}/api/user/generate-keypair`, {
      headers: { Authorization: `Bearer ${userAccess}` },
      data: {}
    });
    expect(keyGenRes.ok()).toBeTruthy();
    const keyGen = parseApi<{ secretKey?: string }>(await keyGenRes.json());
    const secretKeyBase64 = String(keyGen.secretKey || "");
    expect(secretKeyBase64.length).toBeGreaterThan(40);

    const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF", "utf8");
    const uploadRes = await request.post(`${apiBase}/api/admin/encrypt`, {
      headers: { Authorization: `Bearer ${adminAccess}` },
      multipart: {
        email: userEmail,
        file: {
          name: "e2e-test.pdf",
          mimeType: "application/pdf",
          buffer: pdfBuffer
        }
      }
    });
    expect(uploadRes.ok()).toBeTruthy();
    const upload = parseApi<{ fileId?: string }>(await uploadRes.json());
    const fileId = String(upload.fileId || "");
    expect(fileId).toMatch(/[a-f0-9]{24}/i);

    const attackerFilelistRes = await request.get(`${apiBase}/api/user/filelist/${userEmail}`, {
      headers: { Authorization: `Bearer ${attackerAccess}` }
    });
    expect(attackerFilelistRes.status()).toBe(403);

    const requestAccessRes = await request.post(`${apiBase}/api/user/request-access`, {
      headers: { Authorization: `Bearer ${userAccess}` },
      data: { fileId, description: "Need access for testing" }
    });
    expect(requestAccessRes.ok()).toBeTruthy();

    const pendingRes = await request.get(`${apiBase}/api/admin/pending-requests`, {
      headers: { Authorization: `Bearer ${adminAccess}` }
    });
    expect(pendingRes.ok()).toBeTruthy();
    const pending = parseApi<{ requests?: Array<{ _id: string; email: string; fileId?: { _id?: string } | string }> }>(await pendingRes.json());
    const targetRequest = (pending.requests || []).find((r) => {
      const pendingFileId = typeof r.fileId === "string" ? r.fileId : r.fileId?._id;
      return r.email === userEmail && String(pendingFileId || "") === fileId;
    });
    expect(targetRequest?._id).toBeTruthy();

    const approveRes = await request.post(`${apiBase}/api/admin/approve-access`, {
      headers: { Authorization: `Bearer ${adminAccess}` },
      data: { requestId: targetRequest!._id }
    });
    expect(approveRes.ok()).toBeTruthy();

    const attackerDecryptRes = await request.post(`${apiBase}/api/user/decrypt`, {
      headers: { Authorization: `Bearer ${attackerAccess}` },
      data: {
        email: userEmail,
        fileId,
        secretKeyBase64,
        token: generateTotp(totpSecret)
      }
    });
    expect(attackerDecryptRes.status()).toBe(403);

    const decryptRes = await request.post(`${apiBase}/api/user/decrypt`, {
      headers: { Authorization: `Bearer ${userAccess}` },
      data: {
        fileId,
        secretKeyBase64,
        token: generateTotp(totpSecret)
      }
    });
    expect(decryptRes.ok()).toBeTruthy();
    expect((decryptRes.headers()["content-type"] || "").toLowerCase()).toContain("application/pdf");

    const deleteRes = await request.delete(`${apiBase}/api/admin/files/${fileId}`, {
      headers: { Authorization: `Bearer ${adminAccess}` },
      data: { reason: "e2e cleanup" }
    });
    expect(deleteRes.ok()).toBeTruthy();

    const listAfterDeleteRes = await request.get(`${apiBase}/api/user/filelist`, {
      headers: { Authorization: `Bearer ${userAccess}` }
    });
    expect(listAfterDeleteRes.ok()).toBeTruthy();
    const listAfterDelete = parseApi<{ files?: Array<{ fileId: string }> }>(await listAfterDeleteRes.json());
    const stillVisible = (listAfterDelete.files || []).some((f) => String(f.fileId) === fileId);
    expect(stillVisible).toBeFalsy();
  });
});

