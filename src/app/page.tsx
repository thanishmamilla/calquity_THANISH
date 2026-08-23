"use client";

import { useRouter } from "next/navigation";
import { CSMS, CUSTOMERS, SUPPORT } from "@/lib/users";
import { SNAPSHOT_LABEL } from "@/lib/time";
import { useSession } from "@/components/session-context";

export default function HomePage() {
  const router = useRouter();
  const { signIn } = useSession();

  async function enter(userId: string) {
    await signIn(userId);
    router.push("/chat");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-10 md:py-16">
      <p className="mono text-xs tracking-[0.22em] text-stone-500 uppercase">ParcelPilot · Support desk</p>
      <h1
        className="mt-3 max-w-2xl text-4xl leading-tight text-stone-900 md:text-6xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Answers with sources, not leftover tickets.
      </h1>
      <p className="mt-5 max-w-2xl text-stone-600">
        Sign-in is mocked, but the server issues an httpOnly session cookie. Tools enforce scope:
        customers see one account, CSMs see their book, support sees everyone. Clock is frozen at{" "}
        {SNAPSHOT_LABEL}.
      </p>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        <RoleColumn title="Customer" note="Own account only">
          {CUSTOMERS.map((user) => (
            <UserButton
              key={user.id}
              name={user.displayName}
              detail={user.blurb}
              hover="hover:border-orange-300 hover:bg-orange-50/60"
              onClick={() => enter(user.id)}
            />
          ))}
        </RoleColumn>

        <RoleColumn title="Support" note="All accounts · issues board">
          {SUPPORT.map((user) => (
            <UserButton
              key={user.id}
              name={user.displayName}
              detail={user.blurb}
              hover="hover:border-emerald-300 hover:bg-emerald-50/70"
              onClick={() => enter(user.id)}
            />
          ))}
        </RoleColumn>

        <RoleColumn title="CSM" note="Assigned accounts only">
          {CSMS.map((user) => (
            <UserButton
              key={user.id}
              name={user.displayName}
              detail={user.blurb}
              hover="hover:border-sky-300 hover:bg-sky-50/70"
              onClick={() => enter(user.id)}
            />
          ))}
        </RoleColumn>
      </div>
    </main>
  );
}

function RoleColumn({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel rounded-3xl p-6">
      <p className="mono text-xs text-stone-500 uppercase">{title}</p>
      <h2 className="mt-1 text-xl" style={{ fontFamily: "var(--font-display)" }}>
        {note}
      </h2>
      <div className="mt-5 grid gap-3">{children}</div>
    </section>
  );
}

function UserButton({
  name,
  detail,
  hover,
  onClick,
}: {
  name: string;
  detail: string;
  hover: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left transition ${hover}`}
    >
      <span className="font-medium">{name}</span>
      <p className="mt-1 text-sm text-stone-500">{detail}</p>
    </button>
  );
}
