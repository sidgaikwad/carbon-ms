import { useDisclosure, useOutsideClick } from "@carbon/react";
import type { PostgrestError } from "@supabase/supabase-js";
import debounce from "lodash/debounce";
import type {
  AriaAttributes,
  ChangeEvent,
  KeyboardEvent,
  UIEvent
} from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import type { Group } from "~/modules/users";
import { path } from "~/utils/path";

import type {
  IndividualOrGroup,
  OptionGroup,
  SelectionItemsById,
  TreeNode,
  UserSelectionGenericQueryFilters,
  UserSelectProps
} from "./types";

const defaultProps = {
  alwaysSelected: [],
  accessibilityLabel: "User selector",
  checkedSelections: false,
  disabled: false,
  hideSelections: false,
  id: "MultiUserSelect",
  innerInputRender: null,
  isMulti: false,
  placeholder: "",
  queryFilters: {} as UserSelectionGenericQueryFilters,
  readOnly: false,
  resetAfterSelection: false,
  selections: [] as IndividualOrGroup[],
  selectionsMaxHeight: 400,
  showAvatars: false,
  usersOnly: false,
  // biome-ignore lint/suspicious/noEmptyBlockStatements: suppressed due to migration
  onCancel: () => {}
};

const TOP_LEVEL_PAGE_SIZE = 20;
const SEARCH_LIMIT = 30;

type ApiUser = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
};

type ApiGroup = {
  id: string;
  name: string;
  companyId: string;
  isEmployeeTypeGroup: boolean;
  isCustomerOrgGroup: boolean;
  isCustomerTypeGroup: boolean;
  isSupplierOrgGroup: boolean;
  isSupplierTypeGroup: boolean;
  users: ApiUser[];
};

type TopLevelGroup = {
  id: string;
  name: string;
  memberCount: number;
};

type TopLevelResponse = {
  groups: TopLevelGroup[];
  hasMore: boolean;
  nextOffset: number | null;
  error?: PostgrestError;
};

type GroupMembersResponse = {
  group: ApiGroup | null;
  subgroups: ApiGroup[];
  users: ApiUser[];
  error?: PostgrestError;
};

type SearchResponse = {
  groups: ApiGroup[];
  users: ApiUser[];
  error?: PostgrestError;
};

export default function useUserSelect(props: UserSelectProps) {
  /* Inner Props */
  const innerProps = useMemo(
    () => ({
      ...defaultProps,
      ...props
    }),
    [props]
  );

  /* Refs */
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listBoxRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<Element>(null);
  const focusableNodes = useRef<Record<string, TreeNode>>({});
  const instanceId = useId();

  /* Disclosures */
  const dropdown = useDisclosure();

  /* Input */
  const [controlledValue, setControlledValue] = useState("");

  /* Output */
  const [filteredOptionGroups, setFilteredOptionGroups] = useState<
    OptionGroup[]
  >([]);
  const [topLevelGroups, setTopLevelGroups] = useState<TopLevelGroup[]>([]);
  const [groupItemsById, setGroupItemsById] = useState<
    Record<string, IndividualOrGroup[]>
  >({});
  const [groupDetailsById, setGroupDetailsById] = useState<
    Record<string, { users: ApiUser[]; subgroups: ApiGroup[] }>
  >({});
  const [groupLoadingById, setGroupLoadingById] = useState<
    Record<string, boolean>
  >({});
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isLoadingTopLevel, setIsLoadingTopLevel] = useState(false);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [hasMoreTopLevelGroups, setHasMoreTopLevelGroups] = useState(true);
  const [nextTopLevelOffset, setNextTopLevelOffset] = useState(0);
  const [errors, setErrors] = useState<PostgrestError | undefined>(undefined);
  const searchRequestId = useRef(0);
  const isLoadingTopLevelRef = useRef(false);
  const loadedGroupIdsRef = useRef<Set<string>>(new Set());
  const loadingGroupIdsRef = useRef<Set<string>>(new Set());
  const prefetchedGroupIdsRef = useRef<Set<string>>(new Set());

  /* Focus */
  const [focusedId, setFocusedId] = useState<string | null>(null);

  /* Selections */
  const [selectionItemsById, setSelectionItemsById] =
    useState<SelectionItemsById>(
      innerProps.selections && innerProps.selections.length > 0
        ? makeSelectionItemsById(innerProps.selections, innerProps.isMulti)
        : {}
    );

  const buildGroupsApiUrl = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const url = new URL(
        path.to.api.groupsByType(innerProps.type),
        "http://localhost"
      );

      if (!innerProps.type) {
        url.searchParams.delete("type");
      }

      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "") {
          url.searchParams.delete(key);
        } else {
          url.searchParams.set(key, String(value));
        }
      }

      return `${url.pathname}${url.search}`;
    },
    [innerProps.type]
  );

  const loadTopLevelGroups = useCallback(
    async (offset: number, replace: boolean) => {
      if (isLoadingTopLevelRef.current) return;

      isLoadingTopLevelRef.current = true;
      setIsLoadingTopLevel(true);
      try {
        const response = await fetch(
          buildGroupsApiUrl({
            mode: "topLevel",
            limit: TOP_LEVEL_PAGE_SIZE,
            offset
          }),
          { headers: { Accept: "application/json" } }
        );
        const payload = (await response.json()) as TopLevelResponse;
        if (!response.ok || payload.error) {
          setErrors(payload.error);
          return;
        }

        setErrors(undefined);
        setTopLevelGroups((prev) => {
          if (replace) return payload.groups ?? [];

          const seen = new Set(prev.map((group) => group.id));
          return prev.concat(
            (payload.groups ?? []).filter((group) => !seen.has(group.id))
          );
        });
        setHasMoreTopLevelGroups(payload.hasMore);
        setNextTopLevelOffset(payload.nextOffset ?? 0);
      } catch {
        // ignore transient UI fetch errors
      } finally {
        isLoadingTopLevelRef.current = false;
        setIsLoadingTopLevel(false);
      }
    },
    [buildGroupsApiUrl]
  );

  useEffect(() => {
    setTopLevelGroups([]);
    setGroupItemsById({});
    setGroupDetailsById({});
    setGroupLoadingById({});
    setExpandedGroupIds(new Set());
    setHasMoreTopLevelGroups(true);
    setNextTopLevelOffset(0);
    isLoadingTopLevelRef.current = false;
    loadedGroupIdsRef.current = new Set();
    loadingGroupIdsRef.current = new Set();
    prefetchedGroupIdsRef.current = new Set();
    setIsSearchActive(false);
    setIsSearchLoading(false);
    setErrors(undefined);

    void loadTopLevelGroups(0, true);
  }, [loadTopLevelGroups]);

  const optionGroups = useMemo<OptionGroup[]>(
    () =>
      topLevelGroups.map((group) => {
        const uid = getGroupId(instanceId, group.id);
        return {
          uid,
          groupId: group.id,
          expanded: expandedGroupIds.has(group.id),
          items: groupItemsById[group.id] ?? [],
          itemCount: group.memberCount,
          loading: groupLoadingById[group.id] ?? false,
          name: group.name
        };
      }),
    [
      expandedGroupIds,
      groupItemsById,
      groupLoadingById,
      instanceId,
      topLevelGroups
    ]
  );

  useEffect(() => {
    if (!isSearchActive) {
      setFilteredOptionGroups(optionGroups);
    }
  }, [isSearchActive, optionGroups]);

  const loadGroupMembers = useCallback(
    async (groupId: string, groupUid: string) => {
      if (
        loadedGroupIdsRef.current.has(groupId) ||
        loadingGroupIdsRef.current.has(groupId)
      ) {
        return;
      }

      loadingGroupIdsRef.current.add(groupId);
      setGroupLoadingById((prev) => ({ ...prev, [groupId]: true }));
      try {
        const response = await fetch(
          buildGroupsApiUrl({ mode: "members", groupId }),
          { headers: { Accept: "application/json" } }
        );
        const payload = (await response.json()) as GroupMembersResponse;
        if (!response.ok || payload.error) {
          setErrors(payload.error);
          return;
        }
        if (!payload.group) {
          setGroupItemsById((prev) => ({ ...prev, [groupId]: [] }));
          setGroupDetailsById((prev) => ({
            ...prev,
            [groupId]: { users: [], subgroups: [] }
          }));
          return;
        }

        const users = payload.users ?? [];
        const subgroups = payload.subgroups ?? [];
        const nextItems = makeGroupItems(
          payload.group,
          subgroups,
          groupUid,
          innerProps.usersOnly
        );

        setErrors(undefined);
        setGroupItemsById((prev) => ({
          ...prev,
          [groupId]: nextItems
        }));
        setGroupDetailsById((prev) => ({
          ...prev,
          [groupId]: {
            users,
            subgroups
          }
        }));
        loadedGroupIdsRef.current.add(groupId);
      } catch {
        // ignore transient UI fetch errors
      } finally {
        loadingGroupIdsRef.current.delete(groupId);
        setGroupLoadingById((prev) => ({ ...prev, [groupId]: false }));
      }
    },
    [buildGroupsApiUrl, innerProps.usersOnly]
  );

  const runServerSearch = useCallback(
    async (query: string) => {
      const search = query.trim();
      if (!search) {
        setIsSearchActive(false);
        setIsSearchLoading(false);
        setFilteredOptionGroups(optionGroups);
        return;
      }

      const requestId = searchRequestId.current + 1;
      searchRequestId.current = requestId;

      setIsSearchActive(true);
      setIsSearchLoading(true);
      try {
        const response = await fetch(
          buildGroupsApiUrl({
            mode: "search",
            q: search,
            limit: SEARCH_LIMIT
          }),
          { headers: { Accept: "application/json" } }
        );
        const payload = (await response.json()) as SearchResponse;
        if (requestId !== searchRequestId.current) return;

        if (!response.ok || payload.error) {
          setErrors(payload.error);
          setFilteredOptionGroups([]);
          return;
        }

        const items = makeSearchItems(
          payload.groups ?? [],
          payload.users ?? [],
          instanceId
        );

        setErrors(undefined);
        setFilteredOptionGroups(
          items.length > 0
            ? [
                {
                  uid: `${instanceId}_search`,
                  expanded: true,
                  isSearchResults: true,
                  items,
                  itemCount: items.length,
                  name: "Results"
                }
              ]
            : []
        );
      } catch {
        if (requestId === searchRequestId.current) {
          setFilteredOptionGroups([]);
        }
      } finally {
        if (requestId === searchRequestId.current) {
          setIsSearchLoading(false);
        }
      }
    },
    [buildGroupsApiUrl, instanceId, optionGroups]
  );

  /* Pre-populate controlled component by id lookup */
  useEffect(() => {
    const incoming = innerProps.value;
    const ids = Array.isArray(incoming) ? incoming : incoming ? [incoming] : [];

    if (ids.length === 0) return;

    let active = true;
    const resolveSelections = async () => {
      try {
        const response = await fetch(
          buildGroupsApiUrl({
            mode: "byIds",
            ids: ids.join(",")
          }),
          { headers: { Accept: "application/json" } }
        );
        const payload = (await response.json()) as SearchResponse;
        if (!active || !response.ok || payload.error) return;

        const options = makeSearchItems(
          payload.groups ?? [],
          payload.users ?? [],
          `${instanceId}_selected`
        );
        const optionsById = new Map(
          options.map((option) => [option.id, option])
        );

        const selections = ids.reduce<SelectionItemsById>((acc, id) => {
          const item = optionsById.get(id);
          if (item) acc[id] = item;
          return acc;
        }, {});

        if (Object.keys(selections).length > 0) {
          setSelectionItemsById(selections);
        }
      } catch {
        // ignore prefilling fetch errors
      }
    };

    void resolveSelections();
    return () => {
      active = false;
    };
  }, [buildGroupsApiUrl, innerProps.value, instanceId]);

  /* Event Handlers */

  const commit = useCallback(() => {
    dropdown.onClose();
    setFocusedId(null);
  }, [dropdown, setFocusedId]);

  useOutsideClick({
    ref: containerRef,
    handler: () => {
      clear();
      commit();
    }
  });

  const focusInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const clear = useCallback(() => {
    setIsSearchActive(false);
    setIsSearchLoading(false);
    setFilteredOptionGroups(optionGroups);
    setControlledValue("");
  }, [optionGroups]);

  const resetFocus = useCallback(() => {
    setFocusedId(null);
    focusInput();
    if (listBoxRef) {
      listBoxRef.current?.scrollTo(0, 0);
    }
  }, [focusInput]);

  const onGroupExpand = useCallback(
    (uid: string) => {
      const group = optionGroups.find((g) => g.uid === uid);
      if (!group?.groupId) return;

      setExpandedGroupIds((previous) => new Set(previous).add(group.groupId!));
      void loadGroupMembers(group.groupId, uid);
    },
    [loadGroupMembers, optionGroups]
  );

  const onGroupCollapse = useCallback(
    (uid: string) => {
      const group = optionGroups.find((g) => g.uid === uid);
      if (!group?.groupId) return;

      setExpandedGroupIds((previous) => {
        const next = new Set(previous);
        next.delete(group.groupId!);
        return next;
      });
    },
    [optionGroups]
  );

  const onGroupPrefetch = useCallback(
    (uid: string) => {
      const group = optionGroups.find((g) => g.uid === uid);
      if (!group?.groupId) return;
      if (group.expanded) return;
      if (prefetchedGroupIdsRef.current.has(group.groupId)) return;

      prefetchedGroupIdsRef.current.add(group.groupId);
      void loadGroupMembers(group.groupId, uid);
    },
    [loadGroupMembers, optionGroups]
  );

  const onListScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (isSearchActive) return;
      if (isLoadingTopLevel || !hasMoreTopLevelGroups) return;

      const target = event.currentTarget;
      if (target.scrollTop + target.clientHeight >= target.scrollHeight - 24) {
        void loadTopLevelGroups(nextTopLevelOffset, false);
      }
    },
    [
      hasMoreTopLevelGroups,
      isLoadingTopLevel,
      isSearchActive,
      loadTopLevelGroups,
      nextTopLevelOffset
    ]
  );

  const isExpanded = useCallback(
    (uid: string) =>
      filteredOptionGroups.some((g) => g.uid === uid && g.expanded),
    [filteredOptionGroups]
  );

  const getFirstNode = useCallback(() => {
    return Object.values(focusableNodes.current).find(
      (node) => node !== undefined && node.previousId === undefined
    );
  }, []);

  const getLastNode = useCallback(() => {
    return Object.values(focusableNodes.current).find(
      (node) => node !== undefined && node.nextId === undefined
    );
  }, []);

  const getNextNode = useCallback(
    (currentId: string | null) => {
      if (currentId === null) {
        if (!dropdown.isOpen) dropdown.onOpen();
        return getFirstNode();
      }

      const { nextId } = focusableNodes.current[currentId];
      if (nextId) {
        return focusableNodes.current[nextId];
      }
      resetFocus();
      return null;
    },
    [dropdown, getFirstNode, resetFocus]
  );

  const getPreviousNode = useCallback(
    (currentId: string | null) => {
      if (currentId === null) return getLastNode();

      const { previousId } = focusableNodes.current[currentId];
      if (previousId) {
        return focusableNodes.current[previousId];
      }
      resetFocus();
      return null;
    },
    [getLastNode, resetFocus]
  );

  const hasParent = useCallback(
    (id: string) => {
      const { parentId } = focusableNodes.current[id];
      return parentId !== undefined;
    },
    [focusableNodes]
  );

  const hasChildren = useCallback((id: string) => {
    return focusableNodes.current[id].expandable ?? false;
  }, []);

  const scrollTo = useCallback((elementId: string, delay: boolean) => {
    const element = document.getElementById(elementId);
    const block = "nearest";
    if (element) {
      if (delay) {
        setTimeout(() => {
          element.scrollIntoView({ block });
        }, 80);
      } else {
        element.scrollIntoView({ block });
      }
    }
  }, []);

  const getSelectionById = useCallback(
    (uid: string) => {
      for (const group of filteredOptionGroups) {
        const result = group.items.find((item) => item.uid === uid);
        if (result) return result;
      }

      return undefined;
    },
    [filteredOptionGroups]
  );

  const setFocus = useCallback(
    (command: string) => {
      let nextFocusedId = focusedId;
      let scrollDelay = false;
      switch (command) {
        case "first":
          nextFocusedId = getFirstNode()?.uid ?? null;
          break;
        case "last":
          nextFocusedId = getLastNode()?.uid ?? null;
          break;
        case "previous":
          nextFocusedId = getPreviousNode(focusedId)?.uid ?? null;
          break;
        case "next":
          nextFocusedId = getNextNode(focusedId)?.uid ?? null;
          break;
        default:
          nextFocusedId = command;
          scrollDelay = true;
      }

      setFocusedId(nextFocusedId);

      if (nextFocusedId) {
        const element = document.getElementById(nextFocusedId);
        if (element) element.focus();
        scrollTo(nextFocusedId, scrollDelay);
      }
    },
    [
      focusedId,
      getFirstNode,
      getLastNode,
      getPreviousNode,
      getNextNode,
      scrollTo,
      setFocusedId
    ]
  );

  const debouncedInputChange = useMemo(() => {
    return debounce((search: string) => {
      void runServerSearch(search);
      resetFocus();
    }, 240);
  }, [resetFocus, runServerSearch]);

  const onInputFocus = useCallback(() => {
    dropdown.onOpen();
    resetFocus();
  }, [dropdown, resetFocus]);

  const onInputBlur = useCallback(
    (e: any) => {
      if (innerProps.onBlur && typeof innerProps.onBlur === "function") {
        innerProps.onBlur(e);
      }
    },
    [innerProps]
  );

  const onMouseOver = useCallback(() => {
    setFocusedId(null);
  }, []);

  const onChange = useCallback(
    (selections: IndividualOrGroup[]) => {
      if (innerProps.onChange && typeof innerProps.onChange === "function") {
        innerProps.onChange(selections);
      }
    },
    [innerProps]
  );

  const onCheckedChange = useCallback(
    (selections: IndividualOrGroup[]) => {
      if (
        innerProps.onCheckedSelectionsChange &&
        typeof innerProps.onChange === "function"
      ) {
        innerProps.onCheckedSelectionsChange(selections);
      }
    },
    [innerProps]
  );

  const onSelect = useCallback(
    (selectionItem?: IndividualOrGroup) => {
      if (selectionItem === undefined) return;
      setSelectionItemsById((previousSelections) => {
        const nextSelections = innerProps.isMulti
          ? {
              ...previousSelections
            }
          : {};

        nextSelections[selectionItem.id] = checked(selectionItem);

        onChange(Object.values(nextSelections));
        return nextSelections;
      });
      if (innerProps.isMulti && !innerProps.resetAfterSelection) {
        setFocusedId(selectionItem.uid!);
      } else {
        commit();
        clear();
      }
    },
    [
      clear,
      commit,
      innerProps.isMulti,
      innerProps.resetAfterSelection,
      onChange,
      setFocusedId,
      setSelectionItemsById
    ]
  );

  const onDeselect = useCallback(
    (selectionItem: IndividualOrGroup) => {
      if (selectionItem === undefined) return;
      const { id } = selectionItem;
      setSelectionItemsById((previousSelections) => {
        if (id in previousSelections) {
          // biome-ignore lint/correctness/noUnusedVariables: suppressed due to migration
          const { [id]: removed, ...newSelectionCodes } = previousSelections;

          onChange(Object.values(newSelectionCodes));
          return newSelectionCodes;
        }

        return previousSelections;
      });
    },
    [onChange, setSelectionItemsById]
  );

  const onToggle = useCallback(
    (selectionItem?: IndividualOrGroup) => {
      if (selectionItem === undefined) return;
      if (selectionItem.id in selectionItemsById) {
        onDeselect(selectionItem);
      } else {
        onSelect(selectionItem);
      }
    },
    [onDeselect, onSelect, selectionItemsById]
  );

  const onToggleChecked = useCallback(
    (selectionItem?: IndividualOrGroup) => {
      if (selectionItem === undefined) return;
      setSelectionItemsById((previousSelections) => {
        const nextSelections = {
          ...previousSelections,
          [selectionItem.id]: toggleChecked(selectionItem)
        };

        onCheckedChange(Object.values(nextSelections));
        return nextSelections;
      });
    },
    [onCheckedChange]
  );

  const removeSelections = useCallback(() => {
    Object.values(selectionItemsById).forEach((item) => {
      onDeselect(item);
    });
  }, [onDeselect, selectionItemsById]);

  const onClearInput = useCallback(() => {
    clear();
    if (!innerProps.isMulti) {
      removeSelections();
    }
  }, [clear, innerProps.isMulti, removeSelections]);

  const onInputChange = useCallback(
    ({ target }: ChangeEvent<HTMLInputElement>): void => {
      setControlledValue(target.value);
      debouncedInputChange(target.value);

      if (target.value?.length > 0) {
        dropdown.onOpen();
      } else {
        debouncedInputChange.cancel();
        setIsSearchActive(false);
        setIsSearchLoading(false);
        setFilteredOptionGroups(optionGroups);
        if (!innerProps.isMulti) {
          removeSelections();
        }
      }
    },
    [
      optionGroups,
      debouncedInputChange,
      dropdown,
      innerProps.isMulti,
      removeSelections,
      setControlledValue
    ]
  );

  const onExplode = useCallback(
    async (selectionItem: IndividualOrGroup) => {
      if (!("users" in selectionItem)) return;

      const { id } = selectionItem;
      const selectedGroup = optionGroups.find((group) => group.groupId === id);
      if (selectedGroup?.groupId) {
        await loadGroupMembers(selectedGroup.groupId, selectedGroup.uid);
      }

      const detail = groupDetailsById[id];
      const users = detail?.users ?? selectionItem.users ?? [];
      const children =
        detail?.subgroups.map((group) => ({
          data: {
            id: group.id,
            name: group.name,
            companyId: group.companyId,
            isEmployeeTypeGroup: group.isEmployeeTypeGroup,
            isCustomerOrgGroup: group.isCustomerOrgGroup,
            isCustomerTypeGroup: group.isCustomerTypeGroup,
            isSupplierOrgGroup: group.isSupplierOrgGroup,
            isSupplierTypeGroup: group.isSupplierTypeGroup,
            users: group.users
          },
          children: []
        })) ?? selectionItem.children;

      setSelectionItemsById((prevSelectionItems) => {
        if (id in prevSelectionItems) {
          // biome-ignore lint/correctness/noUnusedVariables: suppressed due to migration
          const { [id]: removed, ...newSelectionItems } = prevSelectionItems;

          users.forEach((user) => {
            newSelectionItems[user.id] = {
              ...user,
              uid: getOptionId(id, user.id),
              label: user.fullName || ""
            };
          });

          children?.forEach((group) => {
            newSelectionItems[group.data.id] = {
              ...group.data,
              uid: getOptionId(id, group.data.id),
              label: group.data.name || ""
            };
          });

          onChange(Object.values(newSelectionItems));
          return newSelectionItems;
        }

        return prevSelectionItems;
      });
    },
    [groupDetailsById, loadGroupMembers, onChange, optionGroups]
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (innerProps.disabled) {
        return;
      }

      switch (event.key) {
        case "ArrowLeft":
          if (focusedId) {
            if (hasParent(focusedId)) {
              const { parentId } = focusableNodes.current[focusedId];
              onGroupCollapse(parentId!);
              setFocus(parentId!);
            } else {
              onGroupCollapse(focusedId);
            }
            break;
          } else {
            return;
          }

        case "ArrowRight":
          if (focusedId && hasChildren(focusedId)) {
            if (isExpanded(focusedId)) {
              setFocus("next");
            } else {
              onGroupExpand(focusedId);
            }
            break;
          } else {
            return;
          }

        case "Tab":
          clear();
          commit();
          return;
        case "Enter":
          if (focusedId && hasParent(focusedId)) {
            onSelect(getSelectionById(focusedId));
            clear();
            commit();
            break;
          }
          break;
        case "Escape":
          if (dropdown.isOpen) {
            commit();
          } else {
            clear();
          }
          break;
        case " ": // space
          if (focusedId) {
            if (hasParent(focusedId)) {
              onToggle(getSelectionById(focusedId));
            }
            break;
          }
          return;
        case "ArrowUp":
          setFocus("previous");
          break;
        case "ArrowDown":
          if (dropdown.isOpen) {
            setFocus("next");
          } else {
            dropdown.onOpen();
          }
          break;
        case "Home":
          if (!dropdown.isOpen) return;
          setFocus("first");
          break;
        case "End":
          if (!dropdown.isOpen) return;
          setFocus("last");
          break;
        default:
          resetFocus();
          return;
      }
      event.preventDefault();
    },
    [
      commit,
      dropdown,
      focusedId,
      getSelectionById,
      hasParent,
      hasChildren,
      isExpanded,
      innerProps.disabled,
      clear,
      onGroupCollapse,
      onGroupExpand,
      onSelect,
      onToggle,
      resetFocus,
      setFocus
    ]
  );

  /* Accessibility */

  const popoverProps = useMemo<AriaAttributes>(() => ({}), []);

  const listBoxProps = useMemo<AriaAttributes & { id: string }>(
    () => ({
      id: instanceId,
      role: "tree",
      tabIndex: -1
    }),
    [instanceId]
  );

  const inputProps = useMemo<AriaAttributes>(
    () => ({
      role: "combobox",
      "aria-expanded": dropdown.isOpen,
      "aria-controls": dropdown.isOpen ? instanceId : undefined,
      "aria-haspopup": "tree",
      "aria-autocomplete": "list",
      "aria-activedescendant": undefined, // TODO
      autoComplete: "off",
      autoCorrect: "off"
    }),
    [instanceId, dropdown.isOpen]
  );

  const aria = useMemo(
    () => ({
      inputProps,
      listBoxProps,
      popoverProps
    }),
    [inputProps, listBoxProps, popoverProps]
  );

  let inputValue =
    innerProps.isMulti || focusedId || controlledValue
      ? controlledValue
      : (Object.values(selectionItemsById)?.[0]?.label ?? "");

  return {
    aria,
    groups: filteredOptionGroups,
    errors,
    loading: isLoadingTopLevel || isSearchLoading,
    selectionItemsById,
    // focus
    instanceId,
    focusedId,
    // filters
    inputValue,
    // disclosures
    dropdown,
    // props
    innerProps,
    refs: {
      containerRef,
      inputRef,
      listBoxRef,
      popoverRef,
      buttonRef,
      focusableNodes
    },
    // event handlers
    onClearInput,
    onKeyDown,
    onGroupCollapse,
    onGroupExpand,
    onGroupPrefetch,
    onListScroll,
    onInputChange,
    onInputBlur,
    onInputFocus,
    onSelect,
    onDeselect,
    onToggleChecked,
    onExplode,
    onMouseOver,
    setControlledValue,
    setSelectionItemsById
  };
}

function getOptionId(groupId: string, optionId: string) {
  return `${groupId}_${optionId}_option`;
}

function getGroupId(instanceId: string, groupId: string) {
  return `${instanceId}_${groupId}_group`;
}

function checked(item: IndividualOrGroup): IndividualOrGroup {
  return {
    ...item,
    isChecked: true
  };
}

export function isGroup(item: IndividualOrGroup) {
  return (
    ("users" in item && item.users?.length > 0) ||
    ("children" in item && item?.children?.length)
  );
}

function toggleChecked(item: IndividualOrGroup): IndividualOrGroup {
  return {
    ...item,
    isChecked: !item.isChecked || false
  };
}

function makeSelectionItemsById(
  input: IndividualOrGroup[],
  isMulti: boolean
): SelectionItemsById {
  const result: SelectionItemsById = {};
  // biome-ignore lint/suspicious/useIterableCallbackReturn: suppressed due to migration
  input.forEach((item) => {
    if (!(item.id in result)) {
      result[item.id] = checked(item);
      // early exit for signle user select
      if (!isMulti) return result;
    }
  });
  return result;
}

function toGroupTree(group: ApiGroup): Group {
  return {
    data: {
      id: group.id,
      name: group.name,
      companyId: group.companyId,
      isEmployeeTypeGroup: group.isEmployeeTypeGroup,
      isCustomerOrgGroup: group.isCustomerOrgGroup,
      isCustomerTypeGroup: group.isCustomerTypeGroup,
      isSupplierOrgGroup: group.isSupplierOrgGroup,
      isSupplierTypeGroup: group.isSupplierTypeGroup,
      users: group.users
    },
    children: []
  };
}

function toUserItem(user: ApiUser, uidBase: string): IndividualOrGroup {
  return {
    ...user,
    uid: getOptionId(uidBase, user.id),
    label: user.fullName
  };
}

function toGroupItem(
  group: ApiGroup,
  uidBase: string,
  children: ApiGroup[] = []
): IndividualOrGroup {
  return {
    ...group,
    uid: getOptionId(uidBase, group.id),
    label: group.name,
    children: children.map(toGroupTree)
  };
}

function makeGroupItems(
  group: ApiGroup,
  subgroups: ApiGroup[],
  groupUid: string,
  usersOnly: boolean
): IndividualOrGroup[] {
  const result: IndividualOrGroup[] = [];

  if (!usersOnly) {
    result.push(toGroupItem(group, groupUid, subgroups));
    result.push(
      ...subgroups.map((subgroup) => toGroupItem(subgroup, groupUid))
    );
  }

  result.push(...group.users.map((user) => toUserItem(user, groupUid)));
  return result;
}

function makeSearchItems(
  groups: ApiGroup[],
  users: ApiUser[],
  uidBase: string
) {
  const seen = new Set<string>();
  const result: IndividualOrGroup[] = [];

  for (const group of groups) {
    if (seen.has(group.id)) continue;
    seen.add(group.id);
    result.push(toGroupItem(group, uidBase));
  }

  for (const user of users) {
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    result.push(toUserItem(user, uidBase));
  }

  return result;
}
