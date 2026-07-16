import fetch from "node-fetch";
import { stringify } from "qs-esm";

const CMS_HOST = process.env.CMS_HOST;
const CMS_API_KEY = process.env.CMS_API_KEY;

export interface Media {
  id: number;
  alt?: string | null;
  caption?: {
    root: {
      type: string;
      children: {
        type: any;
        version: number;
        [k: string]: unknown;
      }[];
      direction: ("ltr" | "rtl") | null;
      format: "left" | "start" | "center" | "right" | "end" | "justify" | "";
      indent: number;
      version: number;
    };
    [k: string]: unknown;
  } | null;
  updatedAt: string;
  createdAt: string;
  url?: string | null;
  thumbnailURL?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  filesize?: number | null;
  width?: number | null;
  height?: number | null;
  focalX?: number | null;
  focalY?: number | null;
  sizes?: {
    tiny?: {
      url?: string | null;
      width?: number | null;
      height?: number | null;
      mimeType?: string | null;
      filesize?: number | null;
      filename?: string | null;
    };
    thumbnail?: {
      url?: string | null;
      width?: number | null;
      height?: number | null;
      mimeType?: string | null;
      filesize?: number | null;
      filename?: string | null;
    };
    square?: {
      url?: string | null;
      width?: number | null;
      height?: number | null;
      mimeType?: string | null;
      filesize?: number | null;
      filename?: string | null;
    };
    small?: {
      url?: string | null;
      width?: number | null;
      height?: number | null;
      mimeType?: string | null;
      filesize?: number | null;
      filename?: string | null;
    };
    medium?: {
      url?: string | null;
      width?: number | null;
      height?: number | null;
      mimeType?: string | null;
      filesize?: number | null;
      filename?: string | null;
    };
    large?: {
      url?: string | null;
      width?: number | null;
      height?: number | null;
      mimeType?: string | null;
      filesize?: number | null;
      filename?: string | null;
    };
    xlarge?: {
      url?: string | null;
      width?: number | null;
      height?: number | null;
      mimeType?: string | null;
      filesize?: number | null;
      filename?: string | null;
    };
    og?: {
      url?: string | null;
      width?: number | null;
      height?: number | null;
      mimeType?: string | null;
      filesize?: number | null;
      filename?: string | null;
    };
  };
}

export interface Prompt {
  id: number;
  model?: string;
  title: string;
  description: string;
  content: string;
  translatedContent?: string; // Translated content for current locale
  sourceLink?: string; // Optional source link
  sourcePublishedAt: string;
  sourceMedia: string[];
  video?: {
    url: string;
    thumbnail?: string;
  };
  media?: Media[];
  author: {
    name: string;
    link?: string;
  };
  language: string;
  featured?: boolean;
  sort?: number;
  needReferenceImages?: boolean; // Whether this prompt requires user to input images
  sourceMeta?: Record<string, any>;
  imageCategories?: {
    useCases?: Array<PromptCategory>;
    styles?: Array<PromptCategory>;
    subjects?: Array<PromptCategory>;
  };
}

interface CMSResponse {
  docs: Prompt[];
  totalDocs: number;
}

/**
 * 处理 prompt 数据，提取图片
 */
function processPromptImages(item: Prompt): Prompt {
  let images: string[] = [];
  if (item.media) {
    images = item.media.map((m) => m.url || "").filter(Boolean) as string[];
  } else {
    if (item.sourceMedia) {
      images = item.sourceMedia;
    }
    if (item.video?.thumbnail) {
      images.push(item.video.thumbnail);
    }
  }
  return { ...item, sourceMedia: images };
}

/**
 * 获取 featured prompts
 */
async function fetchFeaturedPrompts(
  locale: string
): Promise<{ docs: Prompt[]; totalDocs: number }> {
  const query = {
    limit: 30,
    sort: ["-featured", "sort", "-sourcePublishedAt"].join(","),
    depth: 2,
    locale,
    where: {
      model: {
        equals: "gpt-image-2",
      },
    },
  };

  const stringifiedQuery = stringify(query, { addQueryPrefix: true });
  const url = `${CMS_HOST}/api/prompts${stringifiedQuery}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `users API-Key ${CMS_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`CMS API error: ${response.statusText}`);
  }

  const data = (await response.json()) as CMSResponse;
  const docs = data.docs.filter((p) => p.featured)
    .map(processPromptImages)
    .filter((p) => p.sourceMedia?.length > 0);

  return { docs, totalDocs: data.totalDocs };
}

/**
 * 获取指定类目的 prompts
 */
async function fetchPromptsByCategory(
  categoryId: number,
  categoryTitle: string,
  locale: string
): Promise<Prompt[]> {
  const query = {
    limit: 20,
    sort: ["sort", "-sourcePublishedAt"].join(","),
    depth: 2,
    locale,
    where: {
      model: {
        equals: "gpt-image-2",
      },
      "imageCategories.useCases": {
        contains: categoryId,
      },
    },
  };

  const stringifiedQuery = stringify(query, { addQueryPrefix: true });
  const url = `${CMS_HOST}/api/prompts${stringifiedQuery}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `users API-Key ${CMS_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`CMS API error: ${response.statusText}`);
  }

  const data = (await response.json()) as CMSResponse;
  return data.docs
    .map(processPromptImages)
    .filter((p) => p.sourceMedia?.length > 0)
    .map((p) => ({
      ...p,
      title: `${categoryTitle} - ${p.title}`,
    }));
}

/**
 * 获取 prompts
 * @param locale 语言版本，默认 en-US
 * @param allCategories 完整类目数组，函数内部会筛选出 use-cases 的二级类目
 * @returns { docs: Prompt[], total: number }
 */
export async function fetchAllPrompts(
  locale: string = "en-US",
  allCategories: FilterCategory[] = []
): Promise<{ docs: Prompt[]; total: number }> {
  // 1. 获取 featured prompts
  const { docs: featuredPrompts, totalDocs } =
    await fetchFeaturedPrompts(locale);

  // 2. 筛选出 use-cases 的二级类目（parentSlug 为 use-cases 的类目）
  const useCaseCategories = allCategories.filter(
    (cat) => cat.parentSlug === "use-cases"
  );

  // 3. 按类目顺序获取每个类目的 prompts
  const categoryPrompts: Prompt[] = [];
  const seenIds = new Set(featuredPrompts.map((p) => p.id));

  for (const category of useCaseCategories) {
    const prompts = await fetchPromptsByCategory(
      category.id,
      category.title,
      locale
    );
    // 去重：排除已在 featured 或其他类目中出现的 prompts
    for (const prompt of prompts) {
      if (!seenIds.has(prompt.id)) {
        seenIds.add(prompt.id);
        categoryPrompts.push(prompt);
      }
    }
  }

  const docs = [...featuredPrompts, ...categoryPrompts];
  return { docs, total: totalDocs };
}

/**
 * 排序 prompts
 * @param prompts prompts 数组
 * @param total 可选的总数（用于显示真实总数，而非当前获取的数量）
 */
export function sortPrompts(prompts: Prompt[], total?: number) {
  const featured = prompts.filter((p) => p.featured);
  const regular = prompts.filter((p) => !p.featured);

  return {
    all: prompts,
    featured,
    regular,
    stats: {
      total: total ?? prompts.length,
      featured: featured.length,
    },
  };
}

/**
 * 根据 GitHub issue 编号查找已存在的 prompt
 */
export async function findPromptByGitHubIssue(
  issueNumber: string
): Promise<Prompt | null> {
  const query = {
    limit: 1,
    depth: 2,
    where: {
      "sourceMeta.github_issue": {
        equals: issueNumber,
      },
      model: {
        equals: "gpt-image-2",
      },
    },
  };

  const stringifiedQuery = stringify(query, { addQueryPrefix: true });
  const url = `${CMS_HOST}/api/prompts${stringifiedQuery}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `users API-Key ${CMS_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`CMS API error: ${response.statusText}`);
  }

  const data = (await response.json()) as CMSResponse;
  return data.docs.length > 0 ? data.docs[0] : null;
}

/**
 * Fetch a single prompt by its CMS id.
 * Returns null when the prompt does not exist (HTTP 404).
 */
export async function fetchPromptById(
  id: number | string,
  locale: string = "en"
): Promise<Prompt | null> {
  const query = { depth: 2, locale };
  const stringifiedQuery = stringify(query, { addQueryPrefix: true });
  const url = `${CMS_HOST}/api/prompts/${id}${stringifiedQuery}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `users API-Key ${CMS_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `CMS API error (${response.status}) fetching prompt ${id}: ${response.statusText}`
    );
  }

  const data = (await response.json()) as Prompt;
  return processPromptImages(data);
}

/**
 * 创建新 prompt（直接发布，无草稿）
 */
export async function createPrompt(
  data: Partial<Prompt>
): Promise<Prompt | null> {
  const url = `${CMS_HOST}/api/prompts`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `users API-Key ${CMS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create prompt: ${response.statusText} - ${errorText}`
    );
  }

  return response.json() as Promise<Prompt | null>;
}

/**
 * 更新已存在的 prompt
 */
export async function updatePrompt(
  id: number,
  data: Partial<Prompt>
): Promise<Prompt | null> {
  const url = `${CMS_HOST}/api/prompts/${id}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `users API-Key ${CMS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to update prompt: ${response.statusText} - ${errorText}`
    );
  }

  return response.json() as Promise<Prompt | null>;
}

/**
 * Category from CMS
 */
export interface PromptCategory {
  id: number;
  title: string;
  slug: string;
  parent?: PromptCategory | null;
  featured?: boolean;
  sort?: number;
}

/**
 * Processed category for filtering
 */
export interface FilterCategory {
  id: number;
  title: string;
  slug: string;
  parentId?: number | null;
  parentSlug?: string | null;
  featured?: boolean;
  sort?: number | null;
}

/**
 * Category group organized by parent-child structure
 */
export interface CategoryGroup {
  parentId: number | null;
  parentTitle: string | null;
  parentSlug: string | null;
  children: FilterCategory[];
}

interface CMSCategoryResponse {
  docs: PromptCategory[];
  totalDocs: number;
}

/**
 * Fetch prompt categories from CMS
 */
export async function fetchPromptCategories(locale: string = "en-US"): Promise<{
  allCategories: FilterCategory[];
  featuredCategories: FilterCategory[];
}> {
  const query = {
    limit: 9999,
    sort: "sort",
    locale,
    where: {
      campaign: {
        contains: "gpt-image-2-prompts",
      },
    },
  };

  const stringifiedQuery = stringify(query, { addQueryPrefix: true });
  const url = `${CMS_HOST}/api/prompt-categories${stringifiedQuery}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `users API-Key ${CMS_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`CMS API error: ${response.statusText}`);
  }

  const data = (await response.json()) as CMSCategoryResponse;

  // Transform to FilterCategory format
  const allCategories: FilterCategory[] = data.docs.map((cat) => {
    let parentId: number | null = null;
    let parentSlug: string | null = null;

    if (cat.parent) {
      if (typeof cat.parent === "number") {
        parentId = cat.parent;
      } else if (typeof cat.parent === "object" && cat.parent !== null) {
        parentId = cat.parent.id;
        parentSlug = cat.parent.slug;
      }
    }

    return {
      id: cat.id,
      title: cat.title,
      slug: cat.slug,
      parentId,
      parentSlug,
      featured: cat.featured ?? false,
      sort: cat.sort,
    };
  });

  // Filter featured categories (leaf nodes with featured=true)
  const featuredCategories = allCategories.filter((cat) => {
    const isParent = allCategories.some((c) => c.parentId === cat.id);
    return cat.featured && !isParent;
  });

  return {
    allCategories,
    featuredCategories,
  };
}
