import {
  LoaderFunction,
  redirect,
  type ActionFunction,
  type MetaFunction,
} from "@remix-run/node";
import { useActionData, useLoaderData } from "@remix-run/react";

import { getEmailsByMessageTo } from "database/dao";
import { getWebTursoDB } from "database/db";
import { userMailboxCookie } from "~/cookies.server";
import { Mail } from "~/components/mail/components/mail";

import { nanoid } from "nanoid";

export const meta: MetaFunction = () => {
  return [
    { title: "Smail" },
    { name: "description", content: "Welcome to Smail!" },
  ];
};

export interface UserMailbox {
  userName: string;
  email: string;
  id: string;
}

export const loader: LoaderFunction = async ({ request }) => {
  const turnstileEnabled = process.env.TURNSTILE_ENABLED === "true";
  const siteKey = process.env.TURNSTILE_KEY;
  const accounts =
    ((await userMailboxCookie.parse(
      request.headers.get("Cookie")
    )) as UserMailbox[]) || [];

  if (accounts.length === 0) {
    return {
      accounts,
      mails: [],
      turnstileEnabled,
      siteKey,
    };
  }
  const db = getWebTursoDB(
    process.env.TURSO_DB_URL as string,
    process.env.TURSO_DB_RO_AUTH_TOKEN as string
  );
  const mailsList = accounts.map((mail) => mail.email);

  const mails = await getEmailsByMessageTo(db, mailsList);

  return {
    accounts: accounts,
    mails,
    siteKey,
  };
};

export const action: ActionFunction = async ({ request }) => {
  try {
    if (process.env.TURNSTILE_ENABLED === "true") {
      const passed = await turnstileCheck(request);
      if (!passed) {
        return {
          error: "Failed to pass the turnstile",
        };
      }
    }
    const formData = await request.formData();
    const userName = formData.get("userName");

    if (process.env.TURNSTILE_ENABLED === "true") {
      const passed = await turnstileCheck(request);
      if (!passed) {
        return {
          error: "Failed to pass the turnstile",
        };
      }
    }
    const oldMailbox =
      ((await userMailboxCookie.parse(
        request.headers.get("Cookie")
      )) as UserMailbox[]) || [];

    const isExisting = oldMailbox.find((m) => m.userName === userName);
    if (isExisting) {
      return redirect("/");
    } else {
      const domain = process.env.DOMAIN;
      const emailAddress = `${userName}@${domain}`;
      oldMailbox.push({
        userName: userName as string,
        email: emailAddress,
        id: nanoid(),
      });

      const userMailbox = await userMailboxCookie.serialize(oldMailbox);
      return redirect("/", {
        headers: {
          "Set-Cookie": userMailbox,
        },
      });
    }
  } catch (error) {
    console.error("error: ", error);
    return redirect("/");
  }
};

export async function turnstileCheck(request: Request): Promise<boolean> {
  const response = (await request.formData()).get("cf-turnstile-response");
  if (!response) {
    return false;
  }
  const verifyEndpoint = process.env
    .CLOUDFLARE_TURNSTILE_VERIFY_Endpoint as string;

  const secret = process.env.TURNSTILE_SECRET;
  const resp = await fetch(verifyEndpoint, {
    method: "POST",
    body: JSON.stringify({
      secret,
      response,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });
  const data = await resp.json();
  if (!data.success) {
    return false;
  }
  return true;
}

export default function Index() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { accounts, mails, siteKey } = loaderData;
  // const { data, isFetching } = useQuery({
  //   queryKey: ["mails"],
  //   queryFn: fetchMails,
  //   refetchInterval: 10000,
  // });

  return (
    <>
      <div className="flex-col md:flex">
        <Mail
          accounts={accounts}
          mails={mails}
          defaultLayout={undefined}
          defaultCollapsed={undefined}
          navCollapsedSize={4}
          siteKey={siteKey}
        />
      </div>
      {actionData?.error && (
        <div className="text-red-500">{actionData.error}</div>
      )}
    </>
  );
}
