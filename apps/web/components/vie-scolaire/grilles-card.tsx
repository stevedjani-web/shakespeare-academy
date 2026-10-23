"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { Level, TimeGrid } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  ErrorMessage,
  Field,
  Input,
  Select,
} from "@/components/ui";
import { Layers } from "lucide-react";
import { describeError, TAB_HINT } from "./shared";

/**
 * Grilles horaires nommées : un rythme propre à certains niveaux (par exemple « Maternelle » et « Primaire »,
 * la grande section suivant le rythme du primaire). Un niveau sans grille nommée garde celle de sa section,
 * sinon la grille commune.
 */
export function GrillesCard({
  grids,
  levels,
  levelLabel,
  onSelectGrid,
  onChanged,
}: {
  grids: TimeGrid[];
  levels: Level[];
  levelLabel: (id: string) => string;
  onSelectGrid: (id: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<{ id: string; nom: string } | null>(
    null,
  );

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api.post("/time-grids", {
        nom: name,
        copierDe: copyFrom || undefined,
      });
      setName("");
      setCopyFrom("");
    });
  }

  function startLevels(grid: TimeGrid) {
    setEditing(grid.id);
    setSelected(grid.niveaux.map((l) => l.id));
  }

  const takenBy = (levelId: string, gridId: string) =>
    grids.find(
      (g) => g.id !== gridId && g.niveaux.some((l) => l.id === levelId),
    );

  return (
    <Card>
      <h2 className="mb-1 font-display text-lg font-semibold text-ink">
        {t("sl.grids.title")}
      </h2>
      <p className={`mb-3 ${TAB_HINT}`}>{t("sl.grids.hint")}</p>
      <ErrorMessage>{error}</ErrorMessage>

      {
        <form
          onSubmit={(e) => void create(e)}
          className="mb-4 grid gap-3 border-b border-border pb-4 sm:grid-cols-3"
        >
          <Field label={t("sl.grids.name")}>
            <Input
              required
              placeholder={t("sl.grids.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t("sl.grids.copyFrom")}>
            <Select
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
            >
              <option value="">{t("sl.grids.copyNone")}</option>
              <option value="COMMUNE">{t("sl.hours.slots.commonGrid")}</option>
              {grids.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nom}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit">{t("sl.grids.create")}</Button>
          </div>
        </form>
      }

      {grids.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Layers size={16} /> {t("sl.grids.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {grids.map((g) => (
            <li key={g.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {renaming?.id === g.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={renaming.nom}
                        onChange={(e) =>
                          setRenaming({ id: g.id, nom: e.target.value })
                        }
                        aria-label={t("sl.grids.name")}
                      />
                      <Button
                        onClick={() =>
                          void run(async () => {
                            await api.patch(`/time-grids/${g.id}`, {
                              nom: renaming.nom,
                            });
                            setRenaming(null);
                          })
                        }
                      >
                        {t("sl.common.save")}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setRenaming(null)}
                      >
                        {t("sl.common.cancel")}
                      </Button>
                    </div>
                  ) : (
                    <span className="font-medium text-ink">{g.nom}</span>
                  )}
                  <Badge color="primary">
                    {t("sl.grids.slotCount", { n: g.creneaux })}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => onSelectGrid(g.id)}
                  >
                    {t("sl.grids.editSlots")}
                  </Button>
                  {
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => startLevels(g)}
                      >
                        {t("sl.grids.levels")}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setRenaming({ id: g.id, nom: g.nom })}
                      >
                        {t("sl.common.edit")}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => {
                          if (
                            confirm(
                              t("sl.grids.confirmDelete", { name: g.nom }),
                            )
                          )
                            void run(() => api.delete(`/time-grids/${g.id}`));
                        }}
                      >
                        {t("sl.common.delete")}
                      </Button>
                    </>
                  }
                </div>
              </div>

              <p className="mt-2 text-xs text-ink-muted">
                {g.niveaux.length === 0
                  ? t("sl.grids.noLevels")
                  : g.niveaux.map((l) => levelLabel(l.id)).join(" · ")}
              </p>

              {editing === g.id && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-2 text-sm font-semibold text-ink">
                    {t("sl.grids.pickLevels")}
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {levels.map((l) => {
                      const other = takenBy(l.id, g.id);
                      return (
                        <label
                          key={l.id}
                          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(l.id)}
                            onChange={(e) =>
                              setSelected((prev) =>
                                e.target.checked
                                  ? [...prev, l.id]
                                  : prev.filter((v) => v !== l.id),
                              )
                            }
                          />
                          <span>{levelLabel(l.id)}</span>
                          {other && selected.includes(l.id) && (
                            <span className="text-xs text-ink-muted">
                              {t("sl.grids.leavesOther", { name: other.nom })}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      onClick={() =>
                        void run(async () => {
                          await api.put(`/time-grids/${g.id}/levels`, {
                            levelIds: selected,
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
