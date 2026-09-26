import { NextResponse } from "next/server";
import { getSkillManifests, createCustomSkill, deleteCustomSkill } from "@/lib/skillsRegistry.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const manifests = await getSkillManifests();
    if (id) {
      const skill = manifests.find((s) => s.id === id);
      return skill
        ? NextResponse.json(skill)
        : NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json({ skills: manifests });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { id, name } = body || {};
    if (!id || !name) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    }
    if (!VALID_ID_REGEX.test(id)) {
      return NextResponse.json({ error: "id may only contain a-z, A-Z, 0-9, - and _" }, { status: 400 });
    }
    const result = await createCustomSkill(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const result = await deleteCustomSkill(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}