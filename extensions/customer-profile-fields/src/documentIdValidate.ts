/**
 * Validación DNI/NIE (ES) y NIF (PT) portada de DocumentIdValidatorService (PrestaShop).
 * España: lógica de http://www.sima.cat/nif.php tal cual el servicio PHP para país ES.
 */

const LETTERS_DNI_NIE = "TRWAGMYFPDXBNJZSQVHLCKE";
const LETTERS_CIF_CTRL = "JABCDEFGHI";

export type DocumentIdCountry = "ES" | "PT";

export type ValidateDocumentIdResult =
  | { ok: true }
  | { ok: false; message: string };

function padLeftDigits(numStr: string, len: number): string {
  return numStr.padStart(len, "0");
}

/** Suma dígitos de un número natural escrito en decimal. */
function sumDigits(n: number): number {
  let s = 0;
  const str = String(Math.abs(Math.floor(n)));
  for (let i = 0; i < str.length; i++) {
    s += parseInt(str[i], 10);
  }
  return s;
}

/** Prefijo letra tipo CIF (PHP: preg_match("/[A-H]|[JNPQRSUVW]/", $TIP)). */
function tipMatchesCifLetter(tip: string): boolean {
  return /^[A-HJNPQRSUVW]$/.test(tip);
}

/**
 * Validación documento España (NIF 8 dígitos + letra, NIE XYZ + 7 dígitos + letra, CIF control numérico o letra).
 */
export function validateSpainDocumentId(raw: string): ValidateDocumentIdResult {
  const FAN = raw.trim().toUpperCase();

  let TIP = "";
  let NUM = "";
  let CTR = "";

  let m = FAN.match(/^([A-Z])([0-9]{1,7})([0-9]|\?)$/);
  if (m) {
    [, TIP, NUM, CTR] = m;
  } else {
    m = FAN.match(/^([A-Z])([0-9]{1,7})([A-Z])$/);
    if (m) {
      [, TIP, NUM, CTR] = m;
    } else {
      m = FAN.match(/^([0-9]{8})([A-Z]|\?)$/);
      if (m) {
        TIP = "";
        [, NUM, CTR] = m;
      } else {
        return { ok: false, message: "El formato del DNI/NIE no es correcto" };
      }
    }
  }

  if (TIP === "") {
    NUM = padLeftDigits(NUM, 8);
  } else {
    NUM = padLeftDigits(NUM, 7);
  }

  let CHK: string | number;

  if (tipMatchesCifLetter(TIP)) {
    let chkSum = 0;
    for (let i = 0; i < NUM.length; i++) {
      const digit = parseInt(NUM[i], 10);
      const mult = digit * (i % 2 > 0 ? 1 : 2);
      chkSum += sumDigits(mult);
    }
    CHK = 10 - (chkSum % 10);
    if (CHK === 10) CHK = 0;
    if (/[NPQRSW]/.test(TIP)) {
      CHK = LETTERS_CIF_CTRL.charAt(Number(CHK));
    }
  } else if (/^[KLMX]$/.test(TIP) || TIP === "") {
    CHK = LETTERS_DNI_NIE.charAt(parseInt(NUM, 10) % 23);
  } else if (TIP === "Y") {
    CHK = LETTERS_DNI_NIE.charAt((10000000 + parseInt(NUM, 10)) % 23);
  } else if (TIP === "Z") {
    CHK = LETTERS_DNI_NIE.charAt((20000000 + parseInt(NUM, 10)) % 23);
  } else {
    return { ok: false, message: "El valor del DNI/NIE no es correcto" };
  }

  if (!/\?/.test(CTR) && String(CTR) !== String(CHK)) {
    return { ok: false, message: "La letra de control del DNI/NIE no es válida" };
  }

  return { ok: true };
}

/** NIF Portugal: 9 dígitos con dígito de control (caso PT del PHP). */
export function validatePortugalNif(raw: string): ValidateDocumentIdResult {
  const FAN = raw.trim().replace(/[^0-9]/g, "");

  const m = FAN.match(/^([0-9]{8})([0-9]|\?)$/);
  if (!m) {
    return { ok: false, message: "El formato del NIF portugués no es correcto (9 dígitos)" };
  }

  const NUM = m[1];
  const CTR = m[2];

  if (NUM[0] < "1") {
    return { ok: false, message: "El valor del NIF portugués no es correcto" };
  }

  const weights = [9, 8, 7, 6, 5, 4, 3, 2];
  let chk = 0;
  for (let i = 0; i < NUM.length; i++) {
    chk += weights[i] * parseInt(NUM[i], 10);
  }
  chk = 11 - (chk % 11);
  if (chk >= 10) chk = 0;

  if (!/\?/.test(CTR) && String(CTR) !== String(chk)) {
    return { ok: false, message: "El dígito de control del NIF portugués no es válido" };
  }

  return { ok: true };
}

/** DNI/NIE (ES) o NIF (PT) según país del formulario. */
export function validateNationalIdDocument(
  raw: string,
  country: DocumentIdCountry
): ValidateDocumentIdResult {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) {
    return { ok: false, message: "El número de documento es obligatorio" };
  }

  if (country === "PT") {
    const digitsOnly = trimmed.replace(/[^0-9]/g, "");
    if (digitsOnly.length !== 9) {
      return { ok: false, message: "El NIF debe tener exactamente 9 dígitos" };
    }
    return validatePortugalNif(digitsOnly);
  }

  if (trimmed.length !== 9) {
    return { ok: false, message: "El DNI/NIE debe tener exactamente 9 caracteres" };
  }
  if (!/^[A-Z0-9]+$/.test(trimmed)) {
    return { ok: false, message: "Solo se permiten letras y números, sin espacios" };
  }

  return validateSpainDocumentId(trimmed);
}
