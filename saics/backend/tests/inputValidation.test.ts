import request from "supertest";
import jwt from "jsonwebtoken";
import { promises as dns } from "dns";
import app from "../src/app";
import { StudentModel } from "../src/models/studentModel";
import { JWT_SECRET } from "../src/utils/authToken";
import {
  emailDomainCanReceiveMail,
  validateEmail,
  validateEmailForAccount,
  validateName,
} from "../src/utils/inputValidation";
import {
  validateEmail as validateClientEmail,
  validateName as validateClientName,
} from "../../frontend/src/utils/inputValidation";

jest.mock("dns", () => ({
  promises: {
    resolveMx: jest.fn(),
    resolve4: jest.fn(),
  },
}));
jest.mock("../src/models/studentModel", () => ({
  StudentModel: {
    findAuthState: jest.fn(),
    findByEmail: jest.fn().mockResolvedValue(null),
  },
}));

const mockedDns = dns as unknown as {
  resolveMx: jest.Mock;
  resolve4: jest.Mock;
};
const mockedStudentModel = StudentModel as unknown as {
  findAuthState: jest.Mock;
  findByEmail: jest.Mock;
};

function tokenFor(studentId = 1) {
  return `Bearer ${jwt.sign({ studentId, tokenVersion: 0 }, JWT_SECRET)}`;
}

describe("name and email validation", () => {
  it.each(["Thabo Mokoena", "Anne-Marie O'Neil", "José Pérez"])("T1: accepts valid name %s on client and server", (name) => {
    expect(validateName(name).value).toBe(name);
    expect(validateClientName(name).value).toBe(name);
  });

  it.each(["John123", "12345", "A", "!!!", "<script>"])("T2: rejects invalid name %s on client and server", (name) => {
    expect(validateName(name).error?.field).toBe("fullName");
    expect(validateClientName(name).error?.field).toBe("fullName");
  });

  it("trims and collapses name spacing", () => {
    expect(validateName("  Thabo    Mokoena  ").value).toBe("Thabo Mokoena");
  });

  it.each(["student@gmail.com", "j.doe@university.ac.za"])("T3: accepts valid email %s on client and server", (email) => {
    expect(validateEmail(email).value).toBe(email);
    expect(validateClientEmail(email).value).toBe(email);
  });

  it.each(["0000@0.com", "a@b.c", "test@1.1", "x@@y.com", "a..b@example.com", ".user@example.com"])(
    "T4: rejects invalid email %s on client and server",
    (email) => {
      expect(validateEmail(email).error?.field).toBe("email");
      expect(validateClientEmail(email).error?.field).toBe("email");
    }
  );

  it("normalizes email casing and surrounding whitespace", () => {
    expect(validateEmail("  Student@GMAIL.com  ").value).toBe("student@gmail.com");
  });

  it("uses MX records, falls back to A records, and rejects only clear DNS absence", async () => {
    mockedDns.resolveMx.mockResolvedValueOnce([{ exchange: "mx.example.com", priority: 10 }]);
    await expect(emailDomainCanReceiveMail("student@example.com")).resolves.toBe(true);

    mockedDns.resolveMx.mockRejectedValueOnce(Object.assign(new Error("No MX"), { code: "ENODATA" }));
    mockedDns.resolve4.mockResolvedValueOnce(["192.0.2.1"]);
    await expect(emailDomainCanReceiveMail("student@example.com")).resolves.toBe(true);

    mockedDns.resolveMx.mockRejectedValueOnce(Object.assign(new Error("Not found"), { code: "ENOTFOUND" }));
    mockedDns.resolve4.mockRejectedValueOnce(Object.assign(new Error("Not found"), { code: "ENOTFOUND" }));
    await expect(emailDomainCanReceiveMail("student@example.com")).resolves.toBe(false);

    mockedDns.resolveMx.mockRejectedValueOnce(Object.assign(new Error("No network"), { code: "ECONNREFUSED" }));
    await expect(emailDomainCanReceiveMail("student@example.com")).resolves.toBe(true);
  });

  it("T4: rejects a nonexistent domain when DNS confirms it is absent", async () => {
    mockedDns.resolveMx.mockRejectedValueOnce(Object.assign(new Error("Not found"), { code: "ENOTFOUND" }));
    mockedDns.resolve4.mockRejectedValueOnce(Object.assign(new Error("Not found"), { code: "ENOTFOUND" }));
    await expect(validateEmailForAccount("user@nonexistent-domain-xyz123.com")).resolves.toMatchObject({
      error: { field: "email" },
    });
  });
});

describe("server-side validation with client checks bypassed", () => {
  beforeEach(() => {
    mockedStudentModel.findAuthState.mockResolvedValue({
      role: "admin",
      is_suspended: false,
      deleted_at: null,
      token_version: 0,
      force_password_reset: false,
    });
    mockedStudentModel.findByEmail.mockResolvedValue(null);
  });

  it("T5: rejects invalid names and emails during signup", async () => {
    const invalidName = await request(app).post("/api/auth/register").send({
      fullName: "John123",
      email: "student@gmail.com",
      password: "A-strong-password!92",
      confirmPassword: "A-strong-password!92",
    });
    expect(invalidName.status).toBe(400);
    expect(invalidName.body).toMatchObject({ field: "fullName", message: expect.any(String) });

    const invalidEmail = await request(app).post("/api/auth/register").send({
      fullName: "Valid Name",
      email: "a@b.c",
      password: "A-strong-password!92",
      confirmPassword: "A-strong-password!92",
    });
    expect(invalidEmail.status).toBe(400);
    expect(invalidEmail.body).toMatchObject({ field: "email", message: expect.any(String) });
  });

  it("T5: rejects invalid names during profile edit and admin create/edit", async () => {
    const invalidProfile = await request(app)
      .put("/api/students/me")
      .set("Authorization", tokenFor())
      .send({ fullName: "!!!" });
    expect(invalidProfile.status).toBe(400);
    expect(invalidProfile.body.field).toBe("fullName");

    const invalidCreate = await request(app)
      .post("/api/admin/users")
      .set("Authorization", tokenFor())
      .send({ fullName: "A", email: "student@gmail.com", role: "student" });
    expect(invalidCreate.status).toBe(400);
    expect(invalidCreate.body.field).toBe("fullName");

    const invalidEdit = await request(app)
      .patch("/api/admin/users/2")
      .set("Authorization", tokenFor())
      .send({ fullName: "<script>" });
    expect(invalidEdit.status).toBe(400);
    expect(invalidEdit.body.field).toBe("fullName");
  });
});
