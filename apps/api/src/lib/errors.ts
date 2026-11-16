import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Error yang terkait satu kolom form. Respons: { error, field, fieldMessage }
 * - error: pesan lengkap (untuk alert / notifikasi)
 * - field + fieldMessage: ditampilkan di bawah kolom tersebut
 */
export class FieldError extends HTTPException {
  constructor(
    status: ContentfulStatusCode,
    public field: string,
    public fieldMessage: string,
    message = fieldMessage,
  ) {
    super(status, { message });
  }
}
