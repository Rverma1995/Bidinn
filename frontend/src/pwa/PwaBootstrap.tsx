import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { applyUpdate, register } from "../serviceWorkerRegistration";
import { canSubscribeToWebPush } from "./platform";
import { syncPushSubscriptionIfPreferred } from "./push";

export function PwaBootstrap() {
  const { user, api } = useAuth();

  useEffect(() => {
    register({
      onUpdate: (registration) => {
        toast("A new version of Bidinn CRM is available", {
          description: "Refresh to load the latest build. This avoids staying on a cached old version after a deploy.",
          duration: Infinity,
          action: {
            label: "Refresh",
            onClick: () => applyUpdate(registration),
          },
        });
      },
    });
  }, []);

  useEffect(() => {
    if (!user || !canSubscribeToWebPush()) return;
    void syncPushSubscriptionIfPreferred(api);
  }, [user, api]);

  return null;
}
