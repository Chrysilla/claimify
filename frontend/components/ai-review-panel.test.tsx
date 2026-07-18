import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AIReviewPanel } from "./ai-review-panel";

describe("AIReviewPanel", () => {
  it("labels generated content and exposes evidence and human actions", () => {
    render(<AIReviewPanel finding={{id:"finding-1", patient_id:"maya-thompson", issue:"Treatment duration missing", why_it_matters:"Authorization may be denied.", confidence:0.96, recommended_action:"Add PT dates.", status:"pending", review_note:null, evidence:[{source_type:"clinical_note",source_id:"note-1",label:"Clinical note",excerpt:"Tried physical therapy."}]}} onAction={vi.fn()} />);
    expect(screen.getByText("AI-generated finding")).toBeInTheDocument();
    expect(screen.getByText("96% confidence")).toBeInTheDocument();
    expect(screen.getByText("Clinical note")).toBeInTheDocument();
    expect(screen.getByRole("button", {name:"Approve finding"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name:"Edit recommendation"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name:"Reject finding"})).toBeInTheDocument();
  });
});
