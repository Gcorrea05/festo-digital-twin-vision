// src/hooks/useToast.ts
import * as React from "react";
import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast";

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1_000_000; // ~16 min

export type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type ActionType = typeof actionTypes;

type Action =
  | {
      type: ActionType["ADD_TOAST"];
      toast: ToasterToast;
    }
  | {
      // precisa ter id para localizar o toast a atualizar
      type: ActionType["UPDATE_TOAST"];
      toast: Pick<ToasterToast, "id"> & Partial<ToasterToast>;
    }
  | {
      type: ActionType["DISMISS_TOAST"];
      toastId?: ToasterToast["id"];
    }
  | {
      type: ActionType["REMOVE_TOAST"];
      toastId?: ToasterToast["id"];
    };

interface State {
  toasts: ToasterToast[];
}

// manter referência para agendamentos de remoção
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function clearRemoveTimer(toastId?: string) {
  if (!toastId) return;
  const t = toastTimeouts.get(toastId);
  if (t) {
    clearTimeout(t);
    toastTimeouts.delete(toastId);
  }
}

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST": {
      // evita duplicar o mesmo id por acidente
      const existingIndex = state.toasts.findIndex((t) => t.id === action.toast.id);
      const next =
        existingIndex >= 0
          ? state.toasts.map((t) => (t.id === action.toast.id ? action.toast : t))
          : [action.toast, ...state.toasts];

      return {
        ...state,
        toasts: next.slice(0, TOAST_LIMIT),
      };
    }

    case "UPDATE_TOAST": {
      const { id } = action.toast;
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === id ? { ...t, ...action.toast } : t)),
      };
    }

    case "DISMISS_TOAST": {
      const { toastId } = action;

      // agenda remoção (com delay) sem duplicar timers
      const addToRemoveQueue = (id: string) => {
        if (toastTimeouts.has(id)) return;
        const timeout = setTimeout(() => {
          toastTimeouts.delete(id);
          dispatch({ type: "REMOVE_TOAST", toastId: id });
        }, TOAST_REMOVE_DELAY);
        toastTimeouts.set(id, timeout);
      };

      if (toastId) addToRemoveQueue(toastId);
      else state.toasts.forEach((t) => addToRemoveQueue(t.id));

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined ? { ...t, open: false } : t
        ),
      };
    }

    case "REMOVE_TOAST": {
      // limpa timeout se existir
      clearRemoveTimer(action.toastId);

      if (action.toastId === undefined) {
        // limpando tudo
        // limpa todos os timers também
        for (const id of Array.from(toastTimeouts.keys())) clearRemoveTimer(id);
        return { ...state, toasts: [] };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
    }
  }
};

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}

export type Toast = Omit<ToasterToast, "id">;

function toast({ ...props }: Toast) {
  const id = genId();

  const update = (patch: Partial<ToasterToast>) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...patch, id },
    });

  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
        // se o consumidor passar um onOpenChange próprio, chamamos também
        props.onOpenChange?.(open);
      },
    },
  });

  return { id, dismiss, update };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
    // importante: sem dependências!
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}

export { useToast, toast };
