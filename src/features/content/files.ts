import { convexSiteUrl } from "../../lib/backend";
import type { Id } from "../../../convex/_generated/dataModel";
export async function uploadFile(
  eventId: Id<"events">,
  kind: "image" | "resource",
  file: File,
  token: string | null,
): Promise<Id<"_storage">> {
  if (!token) throw new Error("Vuelve a conectar tu wallet.");
  const response = await fetch(
    `${convexSiteUrl}/event-upload?eventId=${encodeURIComponent(eventId)}&kind=${kind}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type,
        "X-File-Name": encodeURIComponent(file.name),
      },
      body: file,
    },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()).fileId;
}
export async function downloadFile(
  resourceId: Id<"resources">,
  name: string,
  token: string | null,
) {
  const response = await fetch(
    `${convexSiteUrl}/event-file?resourceId=${encodeURIComponent(resourceId)}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!response.ok)
    throw new Error("Este recurso no está disponible para tu cuenta.");
  const url = URL.createObjectURL(await response.blob()),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
