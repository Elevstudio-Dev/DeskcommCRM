import { redirect } from "next/navigation";

// A gestão de conexões WhatsApp mora agora na Central de Conexões (/app/connections),
// acessível por Configurações. Mantemos este redirect para não quebrar links antigos.
export default function WhatsAppSettingsRedirect() {
  redirect("/app/connections");
}
