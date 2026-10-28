"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPLOAD_DIR = exports.avatarUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const UPLOAD_DIR = path_1.default.join(__dirname, "..", "..", "uploads", "avatars");
exports.UPLOAD_DIR = UPLOAD_DIR;
// Ensure the folder exists — a fresh clone of the repo won't have it,
// since uploaded content is gitignored rather than committed.
if (!fs_1.default.existsSync(UPLOAD_DIR)) {
    fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const studentId = req.studentId;
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        cb(null, `${studentId}-${Date.now()}${ext}`);
    },
});
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
exports.avatarUpload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_TYPES.includes(file.mimetype)) {
            cb(new Error("Only JPEG, PNG, or WEBP images are allowed."));
            return;
        }
        cb(null, true);
    },
});
