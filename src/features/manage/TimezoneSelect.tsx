import { useMemo } from "react";

const fallbackTimeZones = [
  "Africa/Cairo", "Africa/Johannesburg", "America/Anchorage",
  "America/Argentina/Buenos_Aires", "America/Bogota", "America/Chicago",
  "America/Denver", "America/Lima", "America/Los_Angeles",
  "America/Mexico_City", "America/New_York", "America/Santiago",
  "America/Sao_Paulo", "Asia/Dubai", "Asia/Hong_Kong", "Asia/Kolkata",
  "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Melbourne", "Australia/Sydney", "Europe/Amsterdam",
  "Europe/Berlin", "Europe/London", "Europe/Madrid", "Europe/Paris",
  "Pacific/Auckland",
];

function supportedTimeZones() {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  return intl.supportedValuesOf?.("timeZone") ?? fallbackTimeZones;
}

function offsetLabel(timeZone: string) {
  try {
    const offset = new Intl.DateTimeFormat("en", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    return offset?.replace(/^GMT$/, "UTC").replace(/^GMT/, "UTC") ?? "UTC";
  } catch {
    return "UTC";
  }
}

export function TimezoneSelect({
  value,
  onChange,
  required = false,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  ariaLabel: string;
}) {
  const groups = useMemo(() => {
    const zones = new Set(supportedTimeZones());
    zones.add("UTC");
    if (value) zones.add(value);
    const grouped = new Map<string, string[]>();
    for (const zone of [...zones].sort((a, b) => a.localeCompare(b))) {
      const region = zone.includes("/") ? zone.split("/")[0] : "UTC";
      grouped.set(region, [...(grouped.get(region) ?? []), zone]);
    }
    return [...grouped.entries()];
  }, [value]);

  return (
    <select
      required={required}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {groups.map(([region, zones]) => (
        <optgroup key={region} label={region}>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone} · {offsetLabel(zone)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
