import {
  NextFetchEvent,
  NextRequest,
  NextResponse,
  userAgent,
} from "next/server";
import { detectBot, parse } from "@/lib/middleware/utils";
import { redis } from "@/lib/upstash";
import { recordClick } from "@/lib/tinybird";
import { REDIRECT_HEADERS } from "../constants";

export default async function LinkMiddleware(
  req: NextRequest,
  ev: NextFetchEvent,
) {
  const { domain, fullKey: key, query } = parse(req);

  if (!domain || !key) {
    return NextResponse.next();
  }

  const response = await redis.get<{
    url: string;
    password?: boolean;
    proxy?: boolean;
    ios?: string;
    android?: string;
  }>(`${domain}:${key}`);
  const { url: target, password, proxy, ios, android } = response || {};

  if (target) {
    // special case for link health monitoring with planetfall.io :)
    if (!req.headers.get("dub-no-track")) {
      ev.waitUntil(recordClick(domain, req, key)); // track the click only if there is no `dub-no-track` header
    }

    if (password) {
      // rewrite to auth page (/_auth/[domain]/[key]) if the link is password protected
      return NextResponse.rewrite(new URL(`/_auth/${domain}/${key}`, req.url));
    }

    const isBot = detectBot(req);
    if (isBot && proxy) {
      // rewrite to proxy page (/_proxy/[domain]/[key]) if it's a bot
      return NextResponse.rewrite(new URL(`/_proxy/${domain}/${key}`, req.url));
    } else if (ios && userAgent(req).os?.name === "iOS") {
      // redirect to iOS link if it is specified and the user is on an iOS device
      return NextResponse.redirect(ios + query, REDIRECT_HEADERS);
    } else if (android && userAgent(req).os?.name === "Android") {
      // redirect to Android link if it is specified and the user is on an Android device
      return NextResponse.redirect(android + query, REDIRECT_HEADERS);
    } else {
      // regular redirect
      return NextResponse.redirect(target + query, REDIRECT_HEADERS);
    }
  } else {
    // short link not found, redirect to root
    return NextResponse.redirect(new URL("/", req.url), REDIRECT_HEADERS);
  }
}
