/** @jsx createElement */
/** @jsxFrag Fragment */
import "@shopify/ui-extensions/customer-account";
import "@shopify/ui-extensions/preact";
import { createElement, render } from "preact";
import { useState } from "preact/hooks";

const CUSTOMER_ACCOUNT_API_URL = "shopify:customer-account/api/2026-01/graphql.json";

async function customerAccountFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(CUSTOMER_ACCOUNT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  return json as T;
}

/** Valor metafield `dast_document_type`: 1 = DNI/NIE unificado, 3 = Pasaporte */
const DOCUMENT_TYPES = [
  { value: "1", label: "DNI/NIE" },
  { value: "3", label: "Pasaporte" },
];

const DOCUMENT_LENGTH_DNI_NIE = 9;
const DOCUMENT_LENGTH_PASSPORT = 20;

function getPublicIdFormatError(documentType: string, raw: string): string | undefined {
  if (!documentType) {
    return undefined;
  }
  const id = raw.trim().toUpperCase();
  if (!id) {
    return "El número de documento es obligatorio";
  }
  if (documentType === "1") {
    if (id.length !== DOCUMENT_LENGTH_DNI_NIE) {
      return `DNI/NIE debe tener exactamente ${DOCUMENT_LENGTH_DNI_NIE} caracteres`;
    }
    if (!/^[A-Z0-9]+$/.test(id)) {
      return "Solo se permiten letras y números, sin espacios";
    }
    return undefined;
  }
  if (documentType === "3") {
    if (id.length !== DOCUMENT_LENGTH_PASSPORT) {
      return `El pasaporte debe tener exactamente ${DOCUMENT_LENGTH_PASSPORT} caracteres`;
    }
    if (!/^[A-Z0-9]+$/.test(id)) {
      return "Solo se permiten letras y números, sin espacios";
    }
    return undefined;
  }
  return "Tipo de documento no válido";
}

const GENDER_OPTIONS = [
  { value: "1", label: "Hombre" },
  { value: "2", label: "Mujer" },
  { value: "3", label: "Prefiero no decirlo" },
];

const COUNTRY_OPTIONS = [
  { value: "PT", label: "Portugal (PT)" },
  { value: "ES", label: "Espana (ES)" },
];

const METAFIELDS_SET_MUTATION = `#graphql
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { key value }
      userErrors { field message }
    }
  }
`;

const GET_CUSTOMER_PROFILE_COMBINED_QUERY = `#graphql
  query GetCustomerProfileExtensionData {
    shop {
      profileShowPortugal: metafield(namespace: "vivofacil_dast", key: "profile_show_portugal") {
        value
      }
    }
    customer {
      id
      publicId: metafield(namespace: "$app", key: "dast_public_id") { value }
      documentType: metafield(namespace: "$app", key: "dast_document_type") { value }
      gender: metafield(namespace: "$app", key: "dast_gender") { value }
      birthDate: metafield(namespace: "$app", key: "dast_birth_date") { value }
      telephoneApp: metafield(namespace: "$app", key: "dast_telephone") { value }
      phoneCustom: metafield(namespace: "custom", key: "dast_phone") { value }
      countryApp: metafield(namespace: "$app", key: "dast_country_code") { value }
      countryCustom: metafield(namespace: "custom", key: "dast_country") { value }
    }
  }
`;

const GET_CUSTOMER_METAFIELDS_QUERY = `#graphql
  query GetCustomerMetafields {
    customer {
      id
      publicId: metafield(namespace: "$app", key: "dast_public_id") { value }
      documentType: metafield(namespace: "$app", key: "dast_document_type") { value }
      gender: metafield(namespace: "$app", key: "dast_gender") { value }
      birthDate: metafield(namespace: "$app", key: "dast_birth_date") { value }
      telephoneApp: metafield(namespace: "$app", key: "dast_telephone") { value }
      phoneCustom: metafield(namespace: "custom", key: "dast_phone") { value }
      countryApp: metafield(namespace: "$app", key: "dast_country_code") { value }
      countryCustom: metafield(namespace: "custom", key: "dast_country") { value }
    }
  }
`;

function countryMetafieldToFormValue(raw: string): string {
  const t = raw.trim();
  if (!t) {
    return "";
  }
  const up = t.toUpperCase();
  if (up === "ES" || up === "PT") {
    return up;
  }
  if (t === "0") {
    return "PT";
  }
  if (t === "1") {
    return "ES";
  }
  return "";
}

/** Antiguo NIE (2) se muestra como DNI/NIE unificado (1). */
function normalizeDocumentTypeForForm(raw: string): string {
  const t = raw.trim();
  if (t === "2") {
    return "1";
  }
  return t;
}

interface FormValues {
  publicId: string;
  documentType: string;
  gender: string;
  birthDate: string;
  telephone: string;
  countryCode: string;
}

interface FormErrors {
  publicId?: string;
  documentType?: string;
  gender?: string;
  birthDate?: string;
  telephone?: string;
  countryCode?: string;
}

interface ExtensionProps {
  initialValues: FormValues;
  initialComplete: boolean;
  customerId: string;
  enablePortugal: boolean;
}

function validate(values: FormValues, enablePortugal: boolean): FormErrors {
  const errors: FormErrors = {};

  if (!values.documentType) {
    errors.documentType = "Selecciona el tipo de documento";
  }
  const publicIdErr = getPublicIdFormatError(values.documentType, values.publicId);
  if (publicIdErr) {
    errors.publicId = publicIdErr;
  }
  if (!values.gender) {
    errors.gender = "Selecciona el género";
  }
  if (!values.birthDate) {
    errors.birthDate = "La fecha de nacimiento es obligatoria";
  } else {
    const birth = new Date(values.birthDate);
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear();
    if (isNaN(birth.getTime())) {
      errors.birthDate = "Fecha no válida";
    } else if (age < 18 || age > 120) {
      errors.birthDate = "Debes tener al menos 18 años";
    }
  }
  if (!values.telephone.trim()) {
    errors.telephone = "El telefono es obligatorio";
  } else if (!/^[0-9+\s-]{7,20}$/.test(values.telephone.trim())) {
    errors.telephone = "Formato de telefono no valido";
  }

  if (enablePortugal) {
    if (!values.countryCode) {
      errors.countryCode = "Selecciona el pais";
    } else if (!["ES", "PT"].includes(values.countryCode)) {
      errors.countryCode = "Solo se admite Espana o Portugal";
    }
  }

  return errors;
}

function Extension({ initialValues, initialComplete, customerId, enablePortugal }: ExtensionProps) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverError, setServerError] = useState("");
  const [isComplete, setIsComplete] = useState(initialComplete);

  function handleChange(field: keyof FormValues, value: string) {
    setValues((prev) => {
      if (field === "documentType" && value !== prev.documentType) {
        return { ...prev, documentType: value, publicId: "" };
      }
      if (field === "publicId" && prev.documentType) {
        const maxLen = prev.documentType === "3" ? DOCUMENT_LENGTH_PASSPORT : DOCUMENT_LENGTH_DNI_NIE;
        return { ...prev, publicId: value.slice(0, maxLen) };
      }
      return { ...prev, [field]: value };
    });
    if (errors[field] || (field === "documentType" && errors.publicId)) {
      setErrors((prev) => ({
        ...prev,
        [field]: undefined,
        ...(field === "documentType" ? { publicId: undefined } : {}),
      }));
    }
    setSaved(false);
  }

  async function handleSubmit() {
    const validationErrors = validate(values, enablePortugal);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const countryForMeta = enablePortugal ? values.countryCode.toUpperCase() : "ES";

    setSaving(true);
    setServerError("");

    try {
      const mutData = await customerAccountFetch<{ data?: { metafieldsSet?: { userErrors?: { message: string }[] } } }>(
        METAFIELDS_SET_MUTATION,
        {
          metafields: [
            {
              ownerId: customerId,
              namespace: "$app",
              key: "dast_public_id",
              value: values.publicId.trim().toUpperCase(),
              type: "single_line_text_field",
            },
            {
              ownerId: customerId,
              namespace: "$app",
              key: "dast_document_type",
              value: values.documentType,
              type: "number_integer",
            },
            {
              ownerId: customerId,
              namespace: "$app",
              key: "dast_gender",
              value: values.gender,
              type: "number_integer",
            },
            {
              ownerId: customerId,
              namespace: "$app",
              key: "dast_birth_date",
              value: values.birthDate,
              type: "date",
            },
            {
              ownerId: customerId,
              namespace: "$app",
              key: "dast_telephone",
              value: values.telephone.trim(),
              type: "single_line_text_field",
            },
            {
              ownerId: customerId,
              namespace: "$app",
              key: "dast_country_code",
              value: countryForMeta,
              type: "single_line_text_field",
            },
          ],
        }
      );

      const userErrors = mutData?.data?.metafieldsSet?.userErrors ?? [];

      if (userErrors.length > 0) {
        setServerError((userErrors as { message: string }[]).map((e) => e.message).join(". "));
      } else {
        setSaved(true);
        setIsComplete(true);
      }
    } catch {
      setServerError("Error al guardar los datos. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <s-section heading="Datos personales adicionales">
      <s-stack direction="block" gap="large">
        {!isComplete && !saved && (
          <s-banner tone="warning" heading="Acción requerida: completa tus datos personales">
            Para poder utilizar todos los servicios de Plancha &amp; Limpieza necesitamos que completes tu información personal. Por favor, rellena los campos a continuación y pulsa &quot;Guardar datos&quot;.
          </s-banner>
        )}
        {serverError && (
          <s-banner tone="critical" heading="Error al guardar">
            {serverError}
          </s-banner>
        )}
        {saved && (
          <s-banner tone="success" heading="Datos guardados correctamente" dismissible />
        )}

        <s-form>
          <s-stack direction="block" gap="base">
            {enablePortugal ? (
              <s-stack direction="block" gap="base">
                <s-select
                  label="Pais"
                  name="countryCode"
                  value={values.countryCode}
                  onChange={(e: Event) => handleChange("countryCode", (e.target as HTMLSelectElement).value)}
                >
                  <s-option value="">Selecciona...</s-option>
                  {COUNTRY_OPTIONS.map((opt) => (
                    <s-option key={opt.value} value={opt.value}>
                      {opt.label}
                    </s-option>
                  ))}
                </s-select>
                {errors.countryCode && <s-text tone="critical">{errors.countryCode}</s-text>}
              </s-stack>
            ) : null}

            <s-select
              label="Tipo de documento"
              name="documentType"
              value={values.documentType}
              onChange={(e: Event) => handleChange("documentType", (e.target as HTMLSelectElement).value)}
            >
              <s-option value="">Selecciona...</s-option>
              {DOCUMENT_TYPES.map((opt) => (
                <s-option key={opt.value} value={opt.value}>
                  {opt.label}
                </s-option>
              ))}
            </s-select>
            {errors.documentType && <s-text tone="critical">{errors.documentType}</s-text>}

            {!values.documentType && (
              <s-text tone="neutral">Selecciona primero el tipo de documento para introducir el número.</s-text>
            )}
            <s-text-field
              label="Número de documento"
              name="publicId"
              value={values.publicId}
              disabled={!values.documentType}
              placeholder={
                !values.documentType
                  ? "—"
                  : values.documentType === "3"
                    ? `${DOCUMENT_LENGTH_PASSPORT} caracteres (letras y números)`
                    : `${DOCUMENT_LENGTH_DNI_NIE} caracteres (letras y números)`
              }
              onInput={(e: Event) => handleChange("publicId", (e.target as HTMLInputElement).value)}
            />
            {errors.publicId && <s-text tone="critical">{errors.publicId}</s-text>}

            <s-select
              label="Género"
              name="gender"
              value={values.gender}
              onChange={(e: Event) => handleChange("gender", (e.target as HTMLSelectElement).value)}
            >
              <s-option value="">Selecciona...</s-option>
              {GENDER_OPTIONS.map((opt) => (
                <s-option key={opt.value} value={opt.value}>
                  {opt.label}
                </s-option>
              ))}
            </s-select>
            {errors.gender && <s-text tone="critical">{errors.gender}</s-text>}

            <s-date-field
              label="Fecha de nacimiento"
              name="birthDate"
              value={values.birthDate}
              onChange={(e: Event) => handleChange("birthDate", (e.target as HTMLInputElement).value)}
            />
            {errors.birthDate && <s-text tone="critical">{errors.birthDate}</s-text>}

            <s-text-field
              label="Telefono"
              name="telephone"
              value={values.telephone}
              onInput={(e: Event) => handleChange("telephone", (e.target as HTMLInputElement).value)}
            />
            {errors.telephone && <s-text tone="critical">{errors.telephone}</s-text>}

            <s-button
              variant="primary"
              onClick={handleSubmit}
              {...(saving ? { loading: true } : {})}
            >
              {saving ? "Guardando..." : "Guardar datos"}
            </s-button>
          </s-stack>
        </s-form>
      </s-stack>
    </s-section>
  );
}

type CombinedQueryResult = {
  data?: {
    shop?: { profileShowPortugal?: { value?: string | null } | null } | null;
    customer?: Record<string, { value: string } | undefined> & {
      id?: string;
      phoneCustom?: { value: string };
      telephoneApp?: { value: string };
      countryCustom?: { value: string };
      countryApp?: { value: string };
    };
  };
  errors?: { message: string }[];
};

export default async () => {
  let initialValues: FormValues = {
    publicId: "",
    documentType: "",
    gender: "",
    birthDate: "",
    telephone: "",
    countryCode: "",
  };
  let initialComplete = false;
  let customerId = "";
  let enablePortugal = false;

  try {
    let combined = await customerAccountFetch<CombinedQueryResult>(GET_CUSTOMER_PROFILE_COMBINED_QUERY);

    if (combined.errors?.length) {
      combined = await customerAccountFetch<CombinedQueryResult>(GET_CUSTOMER_METAFIELDS_QUERY);
      enablePortugal = false;
    } else {
      const shopFlag = combined.data?.shop?.profileShowPortugal?.value;
      enablePortugal = shopFlag === "true";
    }

    const c = combined.data?.customer;
    customerId = c?.id ?? "";
    const phoneRaw = c?.phoneCustom?.value ?? c?.telephoneApp?.value ?? "";
    const countryRaw = c?.countryCustom?.value ?? c?.countryApp?.value ?? "";

    const rawDocType = c?.documentType?.value ?? "";
    const documentType = normalizeDocumentTypeForForm(rawDocType);

    initialValues = {
      publicId: c?.publicId?.value ?? "",
      documentType,
      gender: c?.gender?.value ?? "",
      birthDate: c?.birthDate?.value ?? "",
      telephone: phoneRaw.trim(),
      countryCode: countryMetafieldToFormValue(countryRaw),
    };

    if (!enablePortugal) {
      initialValues.countryCode = "ES";
    }

    const countryOk = enablePortugal ? !!initialValues.countryCode : true;
    initialComplete =
      !!initialValues.publicId &&
      !!initialValues.documentType &&
      !!initialValues.gender &&
      !!initialValues.birthDate &&
      !!initialValues.telephone &&
      countryOk;
  } catch (err) {
    console.error("[CustomerProfileFields] Error loading metafields:", err);
  }

  render(
    <Extension
      initialValues={initialValues}
      initialComplete={initialComplete}
      customerId={customerId}
      enablePortugal={enablePortugal}
    />,
    document.body
  );
};
