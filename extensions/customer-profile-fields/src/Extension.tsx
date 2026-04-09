/** @jsx createElement */
/** @jsxFrag Fragment */
import "@shopify/ui-extensions/customer-account";
import "@shopify/ui-extensions/preact";
import { createElement, Fragment, render } from "preact";
import { useState } from "preact/hooks";

// Customer Account GraphQL API endpoint (requires network_access = true)
const CUSTOMER_ACCOUNT_API_URL = "shopify:customer-account/api/2024-07/graphql.json";

async function customerAccountFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(CUSTOMER_ACCOUNT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  return json as T;
}

const DOCUMENT_TYPES = [
  { value: "1", label: "DNI" },
  { value: "2", label: "NIE" },
  { value: "3", label: "Pasaporte" },
];

const GENDER_OPTIONS = [
  { value: "1", label: "Hombre" },
  { value: "2", label: "Mujer" },
  { value: "3", label: "Prefiero no decirlo" },
];

const METAFIELDS_SET_MUTATION = `#graphql
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { key value }
      userErrors { field message }
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
    }
  }
`;

interface FormValues {
  publicId: string;
  documentType: string;
  gender: string;
  birthDate: string;
}

interface FormErrors {
  publicId?: string;
  documentType?: string;
  gender?: string;
  birthDate?: string;
}

interface ExtensionProps {
  initialValues: FormValues;
  initialComplete: boolean;
  customerId: string;
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};

  if (!values.publicId.trim()) {
    errors.publicId = "El número de documento es obligatorio";
  } else if (!/^[A-Z0-9]{6,20}$/i.test(values.publicId.trim())) {
    errors.publicId = "Formato de documento no válido";
  }
  if (!values.documentType) {
    errors.documentType = "Selecciona el tipo de documento";
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

  return errors;
}

function Extension({ initialValues, initialComplete, customerId }: ExtensionProps) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverError, setServerError] = useState("");
  const [isComplete, setIsComplete] = useState(initialComplete);

  function handleChange(field: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    setSaved(false);
  }

  async function handleSubmit() {
    const validationErrors = validate(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    setServerError("");

    try {
      const mutData = await customerAccountFetch<{ data?: { metafieldsSet?: { userErrors?: { message: string }[] } } }>(
        METAFIELDS_SET_MUTATION,
        {
          metafields: [
            { ownerId: customerId, namespace: "$app", key: "dast_public_id", value: values.publicId.trim().toUpperCase(), type: "single_line_text_field" },
            { ownerId: customerId, namespace: "$app", key: "dast_document_type", value: values.documentType, type: "number_integer" },
            { ownerId: customerId, namespace: "$app", key: "dast_gender", value: values.gender, type: "number_integer" },
            { ownerId: customerId, namespace: "$app", key: "dast_birth_date", value: values.birthDate, type: "date" },
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
            <s-select
              label="Tipo de documento"
              name="documentType"
              value={values.documentType}
              onChange={(e: Event) => handleChange("documentType", (e.target as HTMLSelectElement).value)}
            >
              <s-option value="">Selecciona...</s-option>
              {DOCUMENT_TYPES.map((opt) => (
                <s-option key={opt.value} value={opt.value}>{opt.label}</s-option>
              ))}
            </s-select>
            {errors.documentType && <s-text tone="critical">{errors.documentType}</s-text>}

            <s-text-field
              label="Número de documento"
              name="publicId"
              value={values.publicId}
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
                <s-option key={opt.value} value={opt.value}>{opt.label}</s-option>
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

// Query runs BEFORE render — this is the correct pattern for Customer Account extensions
export default async () => {
  let initialValues: FormValues = { publicId: "", documentType: "", gender: "", birthDate: "" };
  let initialComplete = false;
  let customerId = "";

  try {
    const result = await customerAccountFetch<{ data?: { customer?: Record<string, { value: string } | undefined> & { id?: string } } }>(GET_CUSTOMER_METAFIELDS_QUERY);
    const c = result?.data?.customer;
    customerId = c?.id ?? "";
    initialValues = {
      publicId: c?.publicId?.value ?? "",
      documentType: c?.documentType?.value ?? "",
      gender: c?.gender?.value ?? "",
      birthDate: c?.birthDate?.value ?? "",
    };
    initialComplete = !!initialValues.publicId && !!initialValues.documentType && !!initialValues.gender && !!initialValues.birthDate;
  } catch (err) {
    console.error("[CustomerProfileFields] Error loading metafields:", err);
  }

  render(<Extension initialValues={initialValues} initialComplete={initialComplete} customerId={customerId} />, document.body);
};
