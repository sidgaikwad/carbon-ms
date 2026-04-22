import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { arrayToTree } from "performant-array-to-tree";
import type {
  ClientLoaderFunctionArgs,
  LoaderFunctionArgs
} from "react-router";
import { data } from "react-router";
import type { Group } from "~/modules/users";
import { getCompanyId, groupsByTypeQuery } from "~/utils/react-query";

type GroupType = "employee" | "customer" | "supplier" | null;

type GroupRow = {
  id: string;
  name: string;
  companyId: string;
  parentId: string | null;
  isEmployeeTypeGroup: boolean;
  isCustomerOrgGroup: boolean;
  isCustomerTypeGroup: boolean;
  isSupplierOrgGroup: boolean;
  isSupplierTypeGroup: boolean;
  users: unknown;
};

type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl: string | null;
  email: string;
};

const groupSelect = [
  "id",
  "name",
  "companyId",
  "parentId",
  "isEmployeeTypeGroup",
  "isCustomerOrgGroup",
  "isCustomerTypeGroup",
  "isSupplierOrgGroup",
  "isSupplierTypeGroup",
  "users"
].join(", ");

const SEARCH_LIMIT = 30;
const TOP_LEVEL_PAGE_SIZE = 20;

function toGroupType(type: string | null): GroupType {
  if (type === "employee" || type === "customer" || type === "supplier") {
    return type;
  }
  return null;
}

function applyGroupTypeFilter<
  T extends { eq: (...args: any[]) => T; or: (...args: any[]) => T }
>(query: T, type: GroupType) {
  if (type === "employee") {
    query.eq("isCustomerOrgGroup", false);
    query.eq("isCustomerTypeGroup", false);
    query.eq("isSupplierOrgGroup", false);
    query.eq("isSupplierTypeGroup", false);
  } else if (type === "customer") {
    query.or("isCustomerTypeGroup.eq.true,isCustomerOrgGroup.eq.true");
  } else if (type === "supplier") {
    query.or("isSupplierTypeGroup.eq.true,isSupplierOrgGroup.eq.true");
  }

  return query;
}

function parseLimit(raw: string | null, fallback: number) {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(value, 100);
}

function parseOffset(raw: string | null) {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function normalizeUsers(users: unknown): UserRow[] {
  if (!Array.isArray(users)) return [];

  return users.map((user) => {
    const row = user as Record<string, unknown>;

    const idRaw = row.id ?? row.userId ?? row.user_id ?? "";
    const firstNameRaw = row.firstName ?? row.first_name ?? "";
    const lastNameRaw = row.lastName ?? row.last_name ?? "";
    const fullNameRaw = row.fullName ?? row.full_name ?? row.name ?? "";
    const avatarUrlRaw = row.avatarUrl ?? row.avatar_url ?? null;
    const emailRaw = row.email ?? "";

    const firstName =
      typeof firstNameRaw === "string" ? firstNameRaw : String(firstNameRaw);
    const lastName =
      typeof lastNameRaw === "string" ? lastNameRaw : String(lastNameRaw);
    const fullName =
      typeof fullNameRaw === "string"
        ? fullNameRaw
        : `${firstName} ${lastName}`.trim();

    return {
      id: typeof idRaw === "string" ? idRaw : String(idRaw),
      firstName,
      lastName,
      fullName,
      avatarUrl: typeof avatarUrlRaw === "string" ? avatarUrlRaw : null,
      email: typeof emailRaw === "string" ? emailRaw : String(emailRaw)
    };
  });
}

function normalizeGroup(group: GroupRow) {
  return {
    id: group.id,
    name: group.name,
    companyId: group.companyId,
    isEmployeeTypeGroup: group.isEmployeeTypeGroup,
    isCustomerOrgGroup: group.isCustomerOrgGroup,
    isCustomerTypeGroup: group.isCustomerTypeGroup,
    isSupplierOrgGroup: group.isSupplierOrgGroup,
    isSupplierTypeGroup: group.isSupplierTypeGroup,
    users: normalizeUsers(group.users)
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    role: "employee"
  });

  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  const type = toGroupType(searchParams.get("type"));
  const mode = searchParams.get("mode");

  if (mode === "topLevel") {
    const limit = parseLimit(searchParams.get("limit"), TOP_LEVEL_PAGE_SIZE);
    const offset = parseOffset(searchParams.get("offset"));

    let query = client
      .from("groups")
      .select("id, name, parentId", { count: "exact" })
      .eq("companyId", companyId)
      .is("parentId", null);

    query = applyGroupTypeFilter(query, type);

    const topLevelGroups = await query
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (topLevelGroups.error) {
      return data(
        {
          groups: [],
          hasMore: false,
          nextOffset: null,
          error: topLevelGroups.error
        },
        await flash(
          request,
          error(topLevelGroups.error, "Failed to load groups")
        )
      );
    }

    const ids = (topLevelGroups.data ?? []).map((group) => group.id);
    const memberCountById = new Map<string, number>();

    if (ids.length > 0) {
      const counts = await client
        .from("groups")
        .select("id, users")
        .in("id", ids);
      if (!counts.error && counts.data) {
        for (const row of counts.data as Array<{
          id: string | null;
          users: unknown;
        }>) {
          if (!row.id) continue;
          memberCountById.set(
            row.id,
            Array.isArray(row.users) ? row.users.length : 0
          );
        }
      }
    }

    const total = topLevelGroups.count ?? 0;
    const loaded = offset + (topLevelGroups.data?.length ?? 0);
    const groups = (topLevelGroups.data ?? [])
      .map((group) => {
        if (!group.id || !group.name) return null;
        return {
          id: group.id,
          name: group.name,
          memberCount: memberCountById.get(group.id) ?? 0
        };
      })
      .filter(
        (group): group is { id: string; name: string; memberCount: number } =>
          group !== null
      );

    return {
      groups,
      hasMore: loaded < total,
      nextOffset: loaded < total ? loaded : null
    };
  }

  if (mode === "members") {
    const groupId = searchParams.get("groupId");

    if (!groupId) {
      return data({ group: null, subgroups: [], users: [] }, { status: 400 });
    }

    let groupQuery = client
      .from("groups")
      .select(groupSelect)
      .eq("companyId", companyId)
      .eq("id", groupId);

    let subgroupQuery = client
      .from("groups")
      .select(groupSelect)
      .eq("companyId", companyId)
      .eq("parentId", groupId);

    const [groupResult, subgroupsResult] = await Promise.all([
      groupQuery.limit(1),
      subgroupQuery.order("name", { ascending: true })
    ]);

    if (groupResult.error || subgroupsResult.error) {
      const err = groupResult.error ?? subgroupsResult.error;
      return data(
        { group: null, subgroups: [], users: [], error: err },
        await flash(request, error(err, "Failed to load group members"))
      );
    }

    const group =
      ((groupResult.data as unknown as GroupRow[] | null) ?? [])[0] ?? null;
    const subgroups =
      (subgroupsResult.data as unknown as GroupRow[] | null) ?? [];

    if (group) {
      return {
        group: normalizeGroup(group),
        subgroups: subgroups.map(normalizeGroup),
        users: normalizeUsers(group.users)
      };
    }

    // Fallback to main tree source behavior if the targeted lookup returns null
    // (we've seen edge cases where synthetic/legacy groups resolve in full-tree only).
    const fallbackQuery = client
      .from("groups")
      .select("*")
      .eq("companyId", companyId);

    const fallbackGroups = await fallbackQuery;
    if (fallbackGroups.error) {
      return {
        group: null,
        subgroups: [],
        users: []
      };
    }

    const tree = arrayToTree(fallbackGroups.data ?? []) as Group[];
    let fallbackGroup: Group | null = null;
    const stack = [...tree];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      if (current.data.id === groupId) {
        fallbackGroup = current;
        break;
      }
      stack.push(...(current.children ?? []));
    }

    if (!fallbackGroup) {
      return {
        group: null,
        subgroups: [],
        users: []
      };
    }

    const fallbackSubgroups = (fallbackGroup.children ?? []).map((child) => ({
      id: child.data.id,
      name: child.data.name,
      companyId: child.data.companyId,
      isEmployeeTypeGroup: child.data.isEmployeeTypeGroup,
      isCustomerOrgGroup: child.data.isCustomerOrgGroup,
      isCustomerTypeGroup: child.data.isCustomerTypeGroup,
      isSupplierOrgGroup: child.data.isSupplierOrgGroup,
      isSupplierTypeGroup: child.data.isSupplierTypeGroup,
      users: normalizeUsers(child.data.users)
    }));

    return {
      group: {
        id: fallbackGroup.data.id,
        name: fallbackGroup.data.name,
        companyId: fallbackGroup.data.companyId,
        isEmployeeTypeGroup: fallbackGroup.data.isEmployeeTypeGroup,
        isCustomerOrgGroup: fallbackGroup.data.isCustomerOrgGroup,
        isCustomerTypeGroup: fallbackGroup.data.isCustomerTypeGroup,
        isSupplierOrgGroup: fallbackGroup.data.isSupplierOrgGroup,
        isSupplierTypeGroup: fallbackGroup.data.isSupplierTypeGroup,
        users: normalizeUsers(fallbackGroup.data.users)
      },
      subgroups: fallbackSubgroups,
      users: normalizeUsers(fallbackGroup.data.users)
    };
  }

  if (mode === "search") {
    const queryString = searchParams.get("q")?.trim() ?? "";
    const limit = parseLimit(searchParams.get("limit"), SEARCH_LIMIT);

    if (!queryString) {
      return { groups: [], users: [] };
    }

    let groupQuery = client
      .from("groups")
      .select(groupSelect)
      .eq("companyId", companyId)
      .ilike("name", `%${queryString}%`)
      .order("name", { ascending: true })
      .limit(limit);
    groupQuery = applyGroupTypeFilter(groupQuery, type);

    const [groups, users] = await Promise.all([
      groupQuery,
      client
        .from("user")
        .select("id, firstName, lastName, fullName, avatarUrl, email")
        .eq("active", true)
        .or(`fullName.ilike.%${queryString}%,email.ilike.%${queryString}%`)
        .order("fullName", { ascending: true })
        .limit(limit)
    ]);

    if (groups.error || users.error) {
      const err = groups.error ?? users.error;
      return data(
        { groups: [], users: [], error: err },
        await flash(request, error(err, "Failed to search users and groups"))
      );
    }

    return {
      groups: ((groups.data as unknown as GroupRow[] | null) ?? []).map(
        normalizeGroup
      ),
      users: normalizeUsers(users.data)
    };
  }

  if (mode === "byIds") {
    const ids = (searchParams.get("ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return { groups: [], users: [] };
    }

    let groupQuery = client
      .from("groups")
      .select(groupSelect)
      .eq("companyId", companyId)
      .in("id", ids);
    groupQuery = applyGroupTypeFilter(groupQuery, type);

    const [groups, users] = await Promise.all([
      groupQuery,
      client
        .from("user")
        .select("id, firstName, lastName, fullName, avatarUrl, email")
        .eq("active", true)
        .in("id", ids)
    ]);

    if (groups.error || users.error) {
      const err = groups.error ?? users.error;
      return data(
        { groups: [], users: [], error: err },
        await flash(
          request,
          error(err, "Failed to resolve selected users and groups")
        )
      );
    }

    return {
      groups: ((groups.data as unknown as GroupRow[] | null) ?? []).map(
        normalizeGroup
      ),
      users: normalizeUsers(users.data)
    };
  }

  const query = client.from("groups").select("*").eq("companyId", companyId);

  applyGroupTypeFilter(query, type);

  const groups = await query;

  if (groups.error) {
    return data(
      { groups: [], error: groups.error },
      await flash(request, error(groups.error, "Failed to load groups"))
    );
  }

  return {
    groups: arrayToTree(groups.data) as Group[]
  };
}

export async function clientLoader({
  request,
  serverLoader
}: ClientLoaderFunctionArgs) {
  const companyId = getCompanyId();

  if (!companyId) {
    return await serverLoader<typeof loader>();
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");

  if (mode) {
    return await serverLoader<typeof loader>();
  }

  const type = url.searchParams.get("type");

  const queryKey = groupsByTypeQuery(companyId, type).queryKey;
  const data =
    window?.clientCache?.getQueryData<Awaited<ReturnType<typeof loader>>>(
      queryKey
    );

  if (!data) {
    const serverData = await serverLoader<typeof loader>();
    window?.clientCache?.setQueryData(queryKey, serverData);
    return serverData;
  }

  return data;
}
clientLoader.hydrate = true;
