import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/admin.middleware";

const createStaffInput = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "cashier"]).default("cashier"),
});

export const listStaffUsers = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: authData, error: authError }, { data: roles, error: rolesError }] =
      await Promise.all([
        supabaseAdmin.auth.admin.listUsers({ perPage: 200 }),
        supabaseAdmin.from("user_roles").select("user_id, role"),
      ]);

    if (authError) throw authError;
    if (rolesError) throw rolesError;

    const roleByUser = new Map((roles ?? []).map((row) => [row.user_id, row.role]));

    return (authData.users ?? [])
      .map((user) => ({
        id: user.id,
        email: user.email ?? "",
        role: roleByUser.get(user.id) ?? null,
        createdAt: user.created_at,
      }))
      .sort((a, b) => a.email.localeCompare(b.email));
  });

export const createStaffUser = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(createStaffInput)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });

    if (createError) throw createError;
    if (!created.user) throw new Error("User was not created");

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: created.user.id,
      role: data.role,
    });

    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw roleError;
    }

    return {
      id: created.user.id,
      email: created.user.email ?? data.email,
      role: data.role,
    };
  });
