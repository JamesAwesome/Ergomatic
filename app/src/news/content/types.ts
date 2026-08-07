import type { ReactNode } from "react";

export type ArticleKind = "first-party" | "linked";

export interface LinkedSource {
  url: string;
  sourceName: string; // e.g. "ROWING NEWS"
  commentary: string; // our italic Newsreader note
}

export interface NewsArticle {
  slug: string;
  title: string;
  minutes: number;
  kind: ArticleKind;
  pinned: boolean;
  publishedAt: string; // ISO yyyy-mm-dd
  updatedAt?: string;
  body?: ReactNode; // first-party only
  linked?: LinkedSource; // linked only
  typeChips?: boolean; // pinned types row carries O2/AT/TR/AN chips
}

export interface ReleaseNote {
  version: string; // a real annotated tag, e.g. "v0.5.1"
  date: string; // ISO yyyy-mm-dd
  items: string[];
}
