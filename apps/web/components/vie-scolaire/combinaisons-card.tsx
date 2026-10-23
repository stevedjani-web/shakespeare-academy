"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { Class, ClassCombination } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  ErrorMessage,
  Field,
  Input,
} from "@/components/ui";
import { Users } from "lucide-react";
import { describeError, TAB_HINT } from "./shared";

/**
 * Classes combinées : plusieurs classes (par exemple GS et CP) suivent ensemble un même cours, avec un seul enseignant
 * et une seule salle. L'emploi du temps n'y voit plus un double emploi pour la même matière au même moment.
 */
export function CombinaisonsCard({
  yearId,
  classes,
  levelLabel,
  onChanged,
}: {
  yearId: string;
  classes: Class[];
  levelLabel: (id: string) => string;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [groups, setGroups] = useState<ClassCombination[]>([]);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editPicked, setEditPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!yearId) return;
    setGroups(
      await api.get<ClassCombination[]>(
        `/class-combinations?academicYearId=${yearId}`,
      ),
    );
  }, [yearId]);

  useEffect(() => {
    void load().catch((e) => setError(describeError(e)));
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  const groupOf = (classId: string) =>
    groups.find((g) => g.classes.some((c) => c.id === classId));
  const label = (c: Class) => `${c.nom} (${levelLabel(c.levelId)})`;

  function renderPicker(
    value: string[],
    onChange: (v: string[]) => void,
    current?: string,
  ) {
    return (
      <div className="grid gap-1.5 sm:grid-cols-2">
        {classes.map((c) => {
          const other = groupOf(c.id);
          const taken = other && other.id !== current;
          return (
            <label
              key={c.id}
              className={`flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm ${taken ? "opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                disabled={!!taken}
                checked={value.includes(c.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, c.id]
                      : value.filter((v) => v !== c.id),
                  )
                }
              />
              <span>{label(c)}</span>
              {taken && (
                <span className="text-xs text-ink-muted">
                  {t("sl.comb.alreadyIn", { name: other.nom })}
                </span>
              )}
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <Card>
      <h2 className="mb-1 font-display text-lg font-semibold text-ink">
        {t("sl.comb.title")}
      </h2>
      <p className={`mb-3 ${TAB_HINT}`}>{t("sl.comb.hint")}</p>
      <ErrorMessage>{error}</ErrorMessage>

      {
        <form
          className="mb-4 space-y-3 border-b border-border pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.post("/class-combinations", {
                nom: name,
                academicYearId: yearId,
                classIds: picked,
              });
              setName("");
              setPicked([]);
            });
          }}
        >
          <Field label={t("sl.comb.name")}>
            <Input
              required
              placeholder={t("sl.comb.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <p className="text-sm font-semibold text-ink">
            {t("sl.comb.pickClasses")}
          </p>
          {renderPicker(picked, setPicked)}
          <Button type="submit" disabled={picked.length < 2 || !yearId}>
            {t("sl.comb.create")}
          </Button>
        </form>
      }

      {groups.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Users size={16} /> {t("sl.comb.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{g.nom}</span>
                  {g.classes.map((c) => (
                    <Badge key={c.id} color="primary">
                      {c.nom}
                    </Badge>
                  ))}
                </div>
                {
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditing(g.id);
                        setEditPicked(g.classes.map((c) => c.id));
                      }}
                    >
                      {t("sl.common.edit")}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (
                          confirm(t("sl.comb.confirmDelete", { name: g.nom }))
                        )
                          void run(() =>
                            api.delete(`/class-combinations/${g.id}`),
                          );
                      }}
                    >
                      {t("sl.common.delete")}
                    </Button>
                  </div>
                }
              </div>
              {editing === g.id && (
                <div className="mt-3 space-y-3 border-t border-border pt-3">
                  {renderPicker(editPicked, setEditPicked, g.id)}
                  <div className="flex gap-2">
                    <Button
                      disabled={editPicked.length < 2}
                      onClick={() =>
                        void run(async () => {
                          await api.patch(`/class-combinations/${g.id}`, {
                            classIds: editPicked,
                          });
                          setEditing(null);
                        })
                      }
                    >
                      {t("sl.common.save")}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setEditing(null)}
                    >
                      {t("sl.common.cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
