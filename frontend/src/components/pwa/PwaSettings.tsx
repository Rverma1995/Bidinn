import React, { useEffect, useState } from "react";
import { Download, Smartphone, Bell } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Separator } from "../ui/separator";
import { useAuth } from "../../contexts/AuthContext";
import { canSubscribeToWebPush, isIosDevice, isStandaloneDisplay, webPushApiAvailable } from "../../pwa/platform";
import { isPushPrefEnabled, subscribeToPush, unsubscribeFromPush } from "../../pwa/push";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandaloneDisplay());
  const ios = isIosDevice();

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      toast.success("Bidinn CRM will be added to your home screen");
    }
    setDeferredPrompt(null);
  };

  return (
    <Card data-testid="pwa-install-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Install app
        </CardTitle>
        <CardDescription>
          Use Bidinn CRM like a mobile app — no native build. Offline data sync is not included;
          only the app shell is cached for faster repeat visits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {installed ? (
          <p className="text-sm text-muted-foreground">This device already has Bidinn CRM installed as an app.</p>
        ) : deferredPrompt ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Chrome on Android and desktop can install Bidinn CRM to your home screen or app list.
            </p>
            <Button onClick={handleInstall} data-testid="pwa-install-btn">
              <Download className="w-4 h-4 mr-2" />
              Install
            </Button>
          </div>
        ) : ios ? (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <span className="font-medium text-foreground">iPhone / iPad (Safari):</span> there is no
              Chrome-style install banner. Open this site in Safari, tap Share, then{" "}
              <span className="font-medium text-foreground">Add to Home Screen</span>.
            </p>
            <p>
              Push notifications on iOS require iOS 16.4+ and only work after the app is added to the
              Home Screen — they are not delivered to a regular Safari tab.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            If Chrome or Edge does not show an install button, look for the install icon in the address
            bar. On Android, use Chrome. The app is installable over HTTPS (or localhost) when the
            manifest and service worker are present.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function PushNotificationToggle() {
  const { api } = useAuth();
  const [enabled, setEnabled] = useState(() => {
    if (typeof Notification === "undefined") return false;
    return isPushPrefEnabled() && Notification.permission === "granted";
  });
  const [busy, setBusy] = useState(false);
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);
  const iosNeedsHomeScreen = isIosDevice() && !isStandaloneDisplay();
  const apiAvailable = webPushApiAvailable();
  const canSubscribe = canSubscribeToWebPush();

  useEffect(() => {
    api
      .get("/push/vapid-public-key")
      .then((res) => setServerEnabled(!!res.data?.enabled))
      .catch(() => setServerEnabled(false));
  }, [api]);

  const handleToggle = async (next: boolean) => {
    if (!next) {
      setBusy(true);
      try {
        await unsubscribeFromPush(api);
        setEnabled(false);
        toast.success("Push notifications disabled on this device");
      } catch (error: any) {
        toast.error(error?.message || "Failed to disable push notifications");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!canSubscribe) {
      if (iosNeedsHomeScreen) {
        toast.error("On iPhone, add Bidinn CRM to the Home Screen first, then enable push from the installed app.");
      } else {
        toast.error("Push notifications are not supported in this browser.");
      }
      return;
    }

    setBusy(true);
    try {
      await subscribeToPush(api);
      setEnabled(true);
      toast.success("Push notifications enabled");
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || error?.message || "Failed to enable push notifications");
    } finally {
      setBusy(false);
    }
  };

  let hint = "Get assignment and follow-up alerts even when this tab is closed.";
  if (serverEnabled === false) {
    hint = "Web Push is not configured on the server (VAPID keys). In-app notifications still work.";
  } else if (!apiAvailable) {
    hint = "This browser does not support the Web Push API.";
  } else if (iosNeedsHomeScreen) {
    hint =
      "On iOS, push only works in the Home Screen app (Safari → Share → Add to Home Screen), iOS 16.4+.";
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4" data-testid="push-notification-toggle">
        <div className="space-y-0.5">
          <Label className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Push notifications
          </Label>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy || serverEnabled === false || (!canSubscribe && !enabled)}
          onCheckedChange={handleToggle}
          data-testid="push-enable-switch"
        />
      </div>
      <Separator />
    </>
  );
}
