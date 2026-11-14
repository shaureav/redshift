// Data access. The deployed app reads only the static snapshot in /data (written by the Python build),
// so every number shown has exactly one source. Nothing here computes a displayed number.
import { useQuery } from "@tanstack/react-query";
import type { Prov } from "./types";

const BASE = `${import.meta.env.BASE_URL}data/`;

export async function fetchJson<T>(name: string): Promise<T> {
  const res = await fetch(`${BASE}${name}`);
  if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
  return (await res.json()) as T;
}

export function useData<T>(name: string) {
  return useQuery<T>({ queryKey: ["data", name], queryFn: () => fetchJson<T>(name), staleTime: Infinity });
}

export function useProvenance(enabled = true) {
  return useQuery<Record<string, Prov>>({
    queryKey: ["data", "provenance.json"],
    queryFn: () => fetchJson<Record<string, Prov>>("provenance.json"),
    staleTime: Infinity,
    enabled,
  });
}

export const dataUrl = (name: string) => `${BASE}${name}`;
