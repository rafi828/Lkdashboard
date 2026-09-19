const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const ISSUER = '[שם החברה] - דשבורד יעדים';

function generateSecret() {
  return authenticator.generateSecret();
}

// otpauth:// URI ש-Google Authenticator (או כל אפליקציית TOTP) יודע לסרוק
function buildOtpAuthUrl(email, secret) {
  return authenticator.keyuri(email, ISSUER, secret);
}

async function buildQrDataUrl(email, secret) {
  const url = buildOtpAuthUrl(email, secret);
  return QRCode.toDataURL(url);
}

// code = מה שהמשתמש הקליד מהאפליקציה (6 ספרות); מתיר סטייה קטנה של שעון (window ברירת מחדל של otplib)
function verifyCode(code, secret) {
  if (!code || !secret) return false;
  try {
    return authenticator.check(String(code).trim(), secret);
  } catch {
    return false;
  }
}

module.exports = { generateSecret, buildOtpAuthUrl, buildQrDataUrl, verifyCode };
