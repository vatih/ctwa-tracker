import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import { HTTPException } from "hono/http-exception";
import { FieldError } from "./errors";
import type { ZodType } from "zod";

/** zValidator dengan error seragam: 400 { error: "pesan" }, plus field untuk body JSON */
export const v = <T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.join(".");
      if (path && target === "json") throw new FieldError(400, path, issue.message, `${path}: ${issue.message}`);
      throw new HTTPException(400, { message: path ? `${path}: ${issue.message}` : (issue?.message ?? "Input tidak valid") });
    }
  });
