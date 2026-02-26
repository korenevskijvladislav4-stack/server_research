import prisma from '../../lib/prisma';
import { Prisma, casino_profile_fields_field_type } from '@prisma/client';

export const casinoProfileService = {
  async listFields() {
    return prisma.casino_profile_fields.findMany({
      orderBy: [{ group_name: 'asc' }, { sort_order: 'asc' }, { id: 'asc' }],
    });
  },

  async createField(data: {
    key_name: string;
    label: string;
    description?: string | null;
    field_type?: casino_profile_fields_field_type;
    options_json?: object | string | null;
    group_name?: string | null;
    sort_order?: number;
    is_required?: boolean;
    is_active?: boolean;
    created_by?: number | null;
  }) {
    const optionsJson =
      data.options_json === null || data.options_json === undefined
        ? null
        : typeof data.options_json === 'string'
          ? (JSON.parse(data.options_json) as object)
          : data.options_json;
    const groupName =
      Array.isArray(data.group_name) && data.group_name.length > 0
        ? String(data.group_name[0])
        : data.group_name ?? null;
    return prisma.casino_profile_fields.create({
      data: {
        key_name: data.key_name,
        label: data.label,
        description: data.description ?? null,
        field_type: (data.field_type as casino_profile_fields_field_type) ?? 'text',
        options_json: optionsJson === null ? Prisma.JsonNull : optionsJson,
        group_name: groupName,
        sort_order: Number.isFinite(data.sort_order) ? data.sort_order! : 0,
        is_required: !!data.is_required,
        is_active: data.is_active === undefined ? true : !!data.is_active,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      },
    });
  },

  async getFieldById(id: number) {
    return prisma.casino_profile_fields.findUnique({ where: { id } });
  },

  async updateField(
    id: number,
    data: Partial<{
      key_name: string;
      label: string;
      description: string | null;
      field_type: casino_profile_fields_field_type;
      options_json: object | null;
      group_name: string | null;
      sort_order: number;
      is_required: boolean;
      is_active: boolean;
      updated_by: number | null;
    }>
  ) {
    const updatePayload: Record<string, unknown> = {};
    const allow = [
      'key_name',
      'label',
      'description',
      'field_type',
      'options_json',
      'group_name',
      'sort_order',
      'is_required',
      'is_active',
      'updated_by',
    ] as const;
    for (const k of allow) {
      if (data[k] !== undefined) {
        if (k === 'group_name' && Array.isArray(data[k])) {
          (updatePayload as any)[k] = (data[k] as unknown[]).length > 0 ? String((data[k] as unknown[])[0]) : null;
        } else {
          (updatePayload as any)[k] = data[k];
        }
      }
    }
    if (Object.keys(updatePayload).length === 0) return null;
    return prisma.casino_profile_fields.update({
      where: { id },
      data: updatePayload as any,
    });
  },

  async deleteField(id: number) {
    return prisma.casino_profile_fields.delete({ where: { id } });
  },

  async getCasinoProfile(casinoId: number) {
    const fields = await prisma.casino_profile_fields.findMany({
      where: { is_active: true },
      orderBy: [{ group_name: 'asc' }, { sort_order: 'asc' }, { id: 'asc' }],
    });
    const values = await prisma.casino_profile_values.findMany({
      where: { casino_id: casinoId },
    });
    const byFieldId = new Map(values.map((v) => [v.field_id, v]));
    const profile = fields.map((f) => ({
      field: f,
      value: byFieldId.get(f.id)?.value_json ?? null,
      updated_at: byFieldId.get(f.id)?.updated_at ?? null,
      updated_by: byFieldId.get(f.id)?.updated_by ?? null,
    }));
    return { casino_id: casinoId, profile };
  },

  async upsertCasinoProfile(
    casinoId: number,
    items: Array<{ field_id: number; value_json: unknown }>,
    actorId: number | null
  ) {
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const fieldId = Number(item.field_id);
        if (!fieldId) continue;

        const existing = await tx.casino_profile_values.findUnique({
          where: { casino_id_field_id: { casino_id: casinoId, field_id: fieldId } },
          select: { value_json: true },
        });
        const oldVal = existing?.value_json ?? null;

        const isClearing =
          item.value_json === null ||
          item.value_json === undefined ||
          (typeof item.value_json === 'string' && item.value_json === '');

        if (isClearing) {
          // Если и так было пусто — ничего не делаем и историю не пишем.
          if (oldVal == null) {
            continue;
          }

          await tx.casino_profile_values.deleteMany({
            where: { casino_id: casinoId, field_id: fieldId },
          });
          await tx.casino_profile_history.create({
            data: {
              casino_id: casinoId,
              field_id: fieldId,
              action: 'clear_value',
              old_value_json: oldVal == null ? Prisma.JsonNull : (oldVal as object),
              new_value_json: Prisma.JsonNull,
              actor_user_id: actorId,
            },
          });
          continue;
        }

        let newVal: unknown;
        if (typeof item.value_json === 'string') {
          try {
            newVal = JSON.parse(item.value_json);
          } catch {
            newVal = item.value_json;
          }
        } else {
          newVal = item.value_json;
        }

        // Если новое значение такое же, как старое — ничего не меняем и историю не пишем.
        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) {
          continue;
        }

        await tx.casino_profile_values.upsert({
          where: { casino_id_field_id: { casino_id: casinoId, field_id: fieldId } },
          create: {
            casino_id: casinoId,
            field_id: fieldId,
            value_json: newVal as object,
            updated_by: actorId,
          },
          update: {
            value_json: newVal as object,
            updated_by: actorId,
          },
        });
        await tx.casino_profile_history.create({
          data: {
            casino_id: casinoId,
            field_id: fieldId,
            action: 'set_value',
            old_value_json: oldVal == null ? Prisma.JsonNull : (oldVal as object),
            new_value_json: newVal as object,
            actor_user_id: actorId,
          },
        });
      }
    });
  },

  async getCasinoProfileHistory(casinoId: number, limit: number) {
    return prisma.casino_profile_history.findMany({
      where: { casino_id: casinoId },
      orderBy: { created_at: 'desc' },
      take: Number.isFinite(limit) ? limit : 200,
      include: {
        casino_profile_fields: { select: { key_name: true, label: true } },
        users: { select: { username: true } },
      },
    });
  },

  async getAllProfileValues(): Promise<Record<number, Record<string, unknown>>> {
    const rows = await prisma.casino_profile_values.findMany({
      where: { casino_profile_fields: { is_active: true } },
      select: {
        casino_id: true,
        casino_profile_fields: { select: { key_name: true } },
        value_json: true,
      },
    });
    const result: Record<number, Record<string, unknown>> = {};
    for (const row of rows) {
      const casinoId = row.casino_id;
      const keyName = row.casino_profile_fields.key_name;
      let value: unknown = row.value_json;
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          // leave as is
        }
      }
      if (!result[casinoId]) result[casinoId] = {};
      result[casinoId][keyName] = value;
    }
    return result;
  },
};
