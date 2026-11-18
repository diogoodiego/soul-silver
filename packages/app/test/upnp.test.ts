import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { findService, isPublicIpv4, openPort, ssdpLocation } from "../src/main/upnp";

// R.5: asking the home router (UPnP IGD) to open the game port to the internet.

const WAN_IP = "urn:schemas-upnp-org:service:WANIPConnection:1";

const description = (control: string) => `<?xml version="1.0"?>
<root><device><deviceList><device><deviceList><device><serviceList>
  <service><serviceType>urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1</serviceType><controlURL>/common</controlURL></service>
  <service><serviceType>${WAN_IP}</serviceType><controlURL>${control}</controlURL></service>
</serviceList></device></deviceList></device></deviceList></device></root>`;

describe("ssdpLocation", () => {
  it("reads the LOCATION header in any case", () => {
    expect(ssdpLocation("HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=120\r\nlocation: http://192.168.0.1:5000/rootDesc.xml\r\n\r\n")).toBe("http://192.168.0.1:5000/rootDesc.xml");
    expect(ssdpLocation("HTTP/1.1 200 OK\r\nST: x\r\n\r\n")).toBeUndefined();
  });
});

describe("findService", () => {
  it("finds the WAN connection service and resolves its control URL against the description", () => {
    expect(findService(description("/ctl/IPConn"), "http://192.168.0.1:5000/rootDesc.xml")).toEqual({ type: WAN_IP, controlUrl: "http://192.168.0.1:5000/ctl/IPConn" });
  });

  it("is undefined for a device without one", () => {
    expect(findService("<root><service><serviceType>urn:x</serviceType><controlURL>/a</controlURL></service></root>", "http://h/")).toBeUndefined();
  });
});

describe("isPublicIpv4", () => {
  it.each(["10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "100.64.0.1", "100.127.1.1", "127.0.0.1", "169.254.1.1", "0.0.0.0", "", "nope"])("refuses %s", (ip) => {
    expect(isPublicIpv4(ip)).toBe(false);
  });
  it.each(["177.10.20.30", "8.8.8.8", "172.32.0.1", "100.128.0.1"])("accepts %s", (ip) => {
    expect(isPublicIpv4(ip)).toBe(true);
  });
});

/** A fake router: answers the description and the SOAP actions, failing the ones in `fail` with that UPnP error code. */
function fakeRouter(externalIp: string, fail: Record<string, number> = {}) {
  const calls: { action: string; body: string }[] = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      if (req.method === "GET") return res.end(description("/ctl"));
      const action = /#(\w+)"/.exec(String(req.headers.soapaction ?? ""))?.[1] ?? "";
      calls.push({ action, body });
      const code = fail[action];
      if (code !== undefined) {
        delete fail[action];
        res.statusCode = 500;
        return res.end(`<s:Envelope><s:Body><s:Fault><detail><UPnPError><errorCode>${code}</errorCode></UPnPError></detail></s:Fault></s:Body></s:Envelope>`);
      }
      res.end(`<s:Envelope><s:Body><u:${action}Response><NewExternalIPAddress>${externalIp}</NewExternalIPAddress></u:${action}Response></s:Body></s:Envelope>`);
    });
  });
  return new Promise<{ location: string; calls: typeof calls; server: Server }>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ location: `http://127.0.0.1:${(server.address() as AddressInfo).port}/desc.xml`, calls, server }));
  });
}

describe("openPort", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  it("maps the port to this PC and gives the public address; close removes the mapping", async () => {
    const router = await fakeRouter("177.10.20.30");
    server = router.server;
    const mapping = await openPort(47800, { location: router.location });
    expect(mapping.address).toBe("177.10.20.30");
    const add = router.calls.find((c) => c.action === "AddPortMapping")!;
    expect(add.body).toContain("<NewExternalPort>47800</NewExternalPort>");
    expect(add.body).toContain("<NewProtocol>TCP</NewProtocol>");
    expect(add.body).toContain("<NewInternalClient>127.0.0.1</NewInternalClient>");
    await mapping.close();
    expect(router.calls.at(-1)?.action).toBe("DeletePortMapping");
  });

  it("puts the port in the address when it is not the default", async () => {
    const router = await fakeRouter("177.10.20.30");
    server = router.server;
    const mapping = await openPort(47801, { location: router.location });
    expect(mapping.address).toBe("177.10.20.30:47801");
    await mapping.close();
  });

  it("falls back to a permanent mapping on routers that only take those (error 725)", async () => {
    const router = await fakeRouter("177.10.20.30", { AddPortMapping: 725 });
    server = router.server;
    const mapping = await openPort(47800, { location: router.location });
    const adds = router.calls.filter((c) => c.action === "AddPortMapping");
    expect(adds).toHaveLength(2);
    expect(adds[1]!.body).toContain("<NewLeaseDuration>0</NewLeaseDuration>");
    await mapping.close();
  });

  it("does not map behind carrier NAT (CGNAT), where friends could not reach it anyway", async () => {
    const router = await fakeRouter("100.70.1.2");
    server = router.server;
    await expect(openPort(47800, { location: router.location })).rejects.toThrow(/CGNAT/);
    expect(router.calls.map((c) => c.action)).toEqual(["GetExternalIPAddress"]);
  });

  it("explains a port already taken by another PC (error 718)", async () => {
    const router = await fakeRouter("177.10.20.30", { AddPortMapping: 718 });
    server = router.server;
    await expect(openPort(47800, { location: router.location })).rejects.toThrow(/outro computador/);
  });

  it("explains a router that does not answer", async () => {
    await expect(openPort(47800, { searchMs: 50, searchTarget: "127.0.0.1" })).rejects.toThrow(/UPnP/);
  });
});
