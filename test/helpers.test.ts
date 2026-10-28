import { describe, expect, it } from "vitest";
import {
  getForecastSlotDaylight,
  getReferencedCurrentEntities,
  getSuntimesInfo,
} from "../src/helpers";
import { HomeAssistant } from "custom-card-helpers";
import { WeatherForecastCardConfig } from "../src/types";

const baseConfig = (
  current: WeatherForecastCardConfig["current"]
): WeatherForecastCardConfig => ({
  type: "custom:weather-forecast-card",
  entity: "weather.demo",
  current,
});

describe("getReferencedCurrentEntities", () => {
  it("returns nothing when there is no current section", () => {
    expect(
      getReferencedCurrentEntities({
        type: "custom:weather-forecast-card",
        entity: "weather.demo",
      })
    ).toEqual([]);
  });

  it("never includes the primary weather entity", () => {
    expect(getReferencedCurrentEntities(baseConfig({}))).toEqual([]);
  });

  it("collects the temperature_entity", () => {
    expect(
      getReferencedCurrentEntities(
        baseConfig({ temperature_entity: "sensor.outdoor_temp" })
      )
    ).toEqual(["sensor.outdoor_temp"]);
  });

  it("collects the secondary_info_attribute custom entity", () => {
    expect(
      getReferencedCurrentEntities(
        baseConfig({
          secondary_info_attribute: {
            name: "humidity",
            entity: "sensor.custom_humidity",
          },
        })
      )
    ).toEqual(["sensor.custom_humidity"]);
  });

  it("ignores a string secondary_info_attribute (weather attribute, no entity)", () => {
    expect(
      getReferencedCurrentEntities(
        baseConfig({ secondary_info_attribute: "humidity" })
      )
    ).toEqual([]);
  });

  it("collects custom entities from an array of show_attributes", () => {
    expect(
      getReferencedCurrentEntities(
        baseConfig({
          show_attributes: [
            "humidity",
            { name: "pressure", entity: "sensor.custom_pressure" },
            { entity: "sensor.custom_wind_speed" },
            null as never,
          ],
        })
      )
    ).toEqual(["sensor.custom_pressure", "sensor.custom_wind_speed"]);
  });

  it("collects a custom entity from a single-object show_attributes", () => {
    expect(
      getReferencedCurrentEntities(
        baseConfig({ show_attributes: { entity: "sensor.custom_dew_point" } })
      )
    ).toEqual(["sensor.custom_dew_point"]);
  });

  it("ignores boolean and string forms of show_attributes", () => {
    expect(
      getReferencedCurrentEntities(baseConfig({ show_attributes: true }))
    ).toEqual([]);
    expect(
      getReferencedCurrentEntities(baseConfig({ show_attributes: "humidity" }))
    ).toEqual([]);
  });

  it("excludes a current-section entity that equals the primary entity", () => {
    expect(
      getReferencedCurrentEntities(
        baseConfig({
          temperature_entity: "weather.demo",
          show_attributes: [{ entity: "weather.demo" }],
        })
      )
    ).toEqual([]);
  });

  it("ignores non-string entity values from misconfigured yaml", () => {
    expect(
      getReferencedCurrentEntities(
        baseConfig({
          show_attributes: [{ entity: 123 as unknown as string }],
          secondary_info_attribute: {
            entity: 456 as unknown as string,
          },
        })
      )
    ).toEqual([]);
  });

  it("de-duplicates entities referenced from multiple sources", () => {
    expect(
      getReferencedCurrentEntities(
        baseConfig({
          temperature_entity: "sensor.outdoor_temp",
          secondary_info_attribute: { entity: "sensor.outdoor_temp" },
          show_attributes: [{ entity: "sensor.outdoor_temp" }],
        })
      )
    ).toEqual(["sensor.outdoor_temp"]);
  });
});

describe("getForecastSlotDaylight", () => {
  // Helsinki
  const hass = {
    config: { latitude: 60.1699, longitude: 24.9384 },
  } as unknown as HomeAssistant;
  const day = new Date("2024-03-20T12:00:00Z");
  const { sunrise, sunset } = getSuntimesInfo(hass, day)!;

  const hourSlotContaining = (date: Date) => {
    const start = new Date(date);
    start.setMinutes(0, 0, 0);
    return { datetime: start.toISOString(), temperature: 0 };
  };

  it("marks a midday hourly slot as daylight", () => {
    expect(
      getForecastSlotDaylight(hass, hourSlotContaining(day), "hourly")
    ).toEqual({ start: true, middle: true, end: true });
  });

  it("marks a midnight hourly slot as night", () => {
    const midnight = new Date(sunset.getTime() + 4 * 3600000);
    expect(
      getForecastSlotDaylight(hass, hourSlotContaining(midnight), "hourly")
    ).toEqual({ start: false, middle: false, end: false });
  });

  it("transitions from night to day in the sunrise slot", () => {
    const slot = getForecastSlotDaylight(
      hass,
      hourSlotContaining(sunrise),
      "hourly"
    );
    expect(slot.start).toBe(false);
    expect(slot.end).toBe(true);
  });

  it("transitions from day to night in the sunset slot", () => {
    const slot = getForecastSlotDaylight(
      hass,
      hourSlotContaining(sunset),
      "hourly"
    );
    expect(slot.start).toBe(true);
    expect(slot.end).toBe(false);
  });

  it("uses the group end time for aggregated hourly slots", () => {
    const start = new Date(sunset.getTime() - 2 * 3600000);
    start.setMinutes(0, 0, 0);
    const groupEnd = new Date(sunset.getTime() + 2 * 3600000);
    const slot = getForecastSlotDaylight(
      hass,
      {
        datetime: start.toISOString(),
        groupEndtime: groupEnd.toISOString(),
        temperature: 0,
      },
      "hourly"
    );
    expect(slot.start).toBe(true);
    expect(slot.end).toBe(false);
  });

  it("uses is_daytime for twice daily slots", () => {
    const forecast = {
      datetime: day.toISOString(),
      temperature: 0,
      is_daytime: false,
    };
    expect(getForecastSlotDaylight(hass, forecast, "twice_daily")).toEqual({
      start: false,
      middle: false,
      end: false,
    });
  });

  it("treats daily slots as daylight", () => {
    const forecast = { datetime: day.toISOString(), temperature: 0 };
    expect(getForecastSlotDaylight(hass, forecast, "daily")).toEqual({
      start: true,
      middle: true,
      end: true,
    });
  });

  it("treats slots as daylight when the location is unknown", () => {
    const midnight = new Date(sunset.getTime() + 4 * 3600000);
    expect(
      getForecastSlotDaylight(
        { config: {} } as unknown as HomeAssistant,
        hourSlotContaining(midnight),
        "hourly"
      )
    ).toEqual({ start: true, middle: true, end: true });
  });
});
