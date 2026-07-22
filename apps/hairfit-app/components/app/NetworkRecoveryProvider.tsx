import * as Network from "expo-network";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type NetworkAvailability = "unknown" | "online" | "offline";

export function resolveNetworkAvailability(state: {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}): NetworkAvailability {
  if (state.isConnected === false || state.isInternetReachable === false) return "offline";
  if (state.isConnected === true) return "online";
  return "unknown";
}

interface NetworkRecoveryContextValue {
  availability: NetworkAvailability;
  recoveryToken: number;
}

const NetworkRecoveryContext = createContext<NetworkRecoveryContextValue>({
  availability: "unknown",
  recoveryToken: 0,
});

export function NetworkRecoveryProvider({ children }: { children: ReactNode }) {
  const networkState = Network.useNetworkState();
  const availability = resolveNetworkAvailability(networkState);
  const previousAvailabilityRef = useRef<NetworkAvailability>("unknown");
  const [recoveryToken, setRecoveryToken] = useState(0);

  useEffect(() => {
    const previous = previousAvailabilityRef.current;
    if (previous === "offline" && availability === "online") {
      setRecoveryToken((current) => current + 1);
    }
    if (availability !== "unknown") {
      previousAvailabilityRef.current = availability;
    }
  }, [availability]);

  const value = useMemo(
    () => ({ availability, recoveryToken }),
    [availability, recoveryToken],
  );

  return (
    <NetworkRecoveryContext.Provider value={value}>
      {children}
    </NetworkRecoveryContext.Provider>
  );
}

export function useNetworkRecovery() {
  return useContext(NetworkRecoveryContext);
}
