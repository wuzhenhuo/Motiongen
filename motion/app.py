"""
HY-Motion-1.0 Web Interface
Connects to tencent/HY-Motion-1.0 Hugging Face Space via gradio_client
"""

import os
import random
from typing import Optional, Tuple, List

import gradio as gr
from gradio_client import Client

HF_SPACE_NAME = "tencent/HY-Motion-1.0"
DEFAULT_SEEDS = "0,1,2,3"
DEFAULT_DURATION = 5.0
DEFAULT_CFG = 5.0

EXAMPLE_PROMPTS = [
    ("A person jumps upward with both legs twice.", 4.5),
    ("A person jumps on their right leg.", 4.5),
    ("A person climbs upward, moving up the slope.", 3.0),
    ("A person walks forward.", 3.0),
    ("A person runs forward.", 4.0),
    ("A person shoots a basketball.", 4.0),
    ("A person stands up from the chair, then stretches their arms.", 4.0),
    ("A person walks unsteadily, then slowly sits down.", 4.0),
    ("A person performs a squat.", 3.0),
    ("A person dances bachata, executing rhythmic hip movements.", 5.0),
    ("A person swings a golf club, hitting the ball forward.", 3.0),
    ("A person runs forward, then kicks a soccer ball.", 4.0),
]

APP_CSS = """
:root {
    --bg-primary: #0f0f23;
    --bg-secondary: #1a1a2e;
    --bg-card: #16213e;
    --text-primary: #e4e4e7;
    --text-secondary: #a1a1aa;
    --accent: #8b5cf6;
    --border: #27272a;
}

body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
}

.main-header {
    text-align: center;
    padding: 20px 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 20px;
}

.main-header h1 {
    background: linear-gradient(135deg, #8b5cf6, #ec4899, #f97316);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: 8px;
}

.main-header p {
    color: var(--text-secondary);
    font-size: 1rem;
}

.footer {
    text-align: center;
    padding: 30px 0;
    border-top: 1px solid var(--border);
    margin-top: 30px;
    color: var(--text-secondary);
}

.generate-button {
    background: linear-gradient(135deg, #8b5cf6, #7c3aed) !important;
    border: none !important;
    font-size: 1.1rem !important;
    transition: all 0.3s ease !important;
}

.generate-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(139, 92, 246, 0.4) !important;
}

textarea, input[type="text"] {
    background: var(--bg-card) !important;
    border: 1px solid var(--border) !important;
    color: var(--text-primary) !important;
    border-radius: 8px !important;
}

input[type="range"] {
    accent-color: var(--accent);
}
"""

HEADER_HTML = """
<div class="main-header">
    <h1>💃 HY-Motion 1.0</h1>
    <p>Text-to-3D Human Motion Generation powered by Tencent Hunyuan</p>
    <p style="font-size:0.85rem; color:#71717a; margin-top:6px;">
        Model: <a href="https://huggingface.co/tencent/HY-Motion-1.0" target="_blank" style="color:#8b5cf6;">tencent/HY-Motion-1.0</a> &nbsp;|&nbsp;
        <a href="https://arxiv.org/pdf/2512.23464" target="_blank" style="color:#8b5cf6;">Paper</a> &nbsp;|&nbsp;
        <a href="https://github.com/Tencent-Hunyuan/HY-Motion-1.0" target="_blank" style="color:#8b5cf6;">GitHub</a>
    </p>
</div>
"""

FOOTER_HTML = """
<div class="footer">
    <p style="font-size:0.9rem;">Powered by Diffusion Transformer (DiT) &amp; Flow Matching</p>
</div>
"""

PLACEHOLDER_HTML = """
<div style="height:520px; display:flex; justify-content:center; align-items:center;
     background:#1a1a2e; border-radius:12px; border:1px solid #27272a; color:#a1a1aa;">
    <div style="text-align:center;">
        <div style="font-size:4rem; margin-bottom:16px;">🎬</div>
        <p style="font-size:1rem;">3D motion visualization will appear here</p>
        <p style="font-size:0.85rem; margin-top:8px; color:#52525b;">Enter a description and click Generate</p>
    </div>
</div>
"""


def create_client(api_key: str) -> Tuple[Optional[Client], str]:
    """Create a Gradio client with HF token authentication."""
    try:
        client = Client(
            HF_SPACE_NAME,
            token=api_key.strip() if api_key.strip() else None,
        )
        return client, "✅ Connected to HY-Motion-1.0"
    except Exception as e:
        return None, f"❌ Connection failed: {str(e)}"


def do_generate(api_key, text, duration, seeds, cfg_scale, use_rewrite):
    """
    Full generation pipeline:
    1. Optional prompt engineering (rewrite)
    2. Motion generation
    """
    if not text.strip():
        yield "❌ Please enter a motion description.", PLACEHOLDER_HTML, gr.update(visible=False)
        return

    if not api_key.strip():
        yield "❌ Please enter your Hugging Face API key.", PLACEHOLDER_HTML, gr.update(visible=False)
        return

    yield "⏳ Connecting to HY-Motion-1.0 Space...", PLACEHOLDER_HTML, gr.update(visible=False)

    client, conn_status = create_client(api_key)
    if client is None:
        yield conn_status, PLACEHOLDER_HTML, gr.update(visible=False)
        return

    rewritten_text = text
    actual_duration = duration

    # Step 1: Prompt engineering (optional)
    if use_rewrite:
        yield "✏️ Rewriting prompt for better generation...", PLACEHOLDER_HTML, gr.update(visible=False)
        try:
            pe_result = client.predict(
                text,
                duration,
                api_name="/_prompt_engineering",
            )
            rewritten_text = str(pe_result[0]) if pe_result[0] else text
            actual_duration = float(pe_result[1]) if pe_result[1] is not None else duration
            print(f"Rewritten: {rewritten_text[:80]}")
        except Exception as e:
            print(f"Prompt engineering failed ({e}), using original text.")

    # Step 2: Generate motion
    yield "🚀 Generating motion... This may take 1–3 minutes.", PLACEHOLDER_HTML, gr.update(visible=False)

    try:
        result = client.predict(
            str(text),
            str(rewritten_text),
            str(seeds),
            float(actual_duration),
            float(cfg_scale),
            api_name="/generate_motion_func",
        )

        html_output = result[0] if len(result) > 0 else ""
        fbx_files = result[1] if len(result) > 1 else []

        if not html_output and not fbx_files:
            yield "⚠️ Generation returned empty output.", PLACEHOLDER_HTML, gr.update(visible=False)
            return

        has_files = bool(fbx_files)
        yield (
            "✅ Motion generated successfully!",
            html_output or PLACEHOLDER_HTML,
            gr.update(value=fbx_files, visible=has_files),
        )

    except Exception as e:
        err = str(e)
        print(f"Generation error: {err}")
        yield f"❌ Generation failed: {err}", PLACEHOLDER_HTML, gr.update(visible=False)


def generate_random_seeds() -> str:
    seeds = [random.randint(0, 999) for _ in range(4)]
    return ",".join(map(str, seeds))


def create_app():
    with gr.Blocks(title="HY-Motion 1.0") as demo:
        gr.HTML(HEADER_HTML)

        with gr.Row():
            # ── Left panel ──────────────────────────────────────────
            with gr.Column(scale=2, min_width=320):

                api_key_input = gr.Textbox(
                    label="🔑 Hugging Face API Key",
                    type="password",
                    placeholder="hf_xxxxxxxxxxxxxxxxxxxx",
                    info="Required. Get yours at huggingface.co/settings/tokens",
                )

                text_input = gr.Textbox(
                    label="📝 Motion Description",
                    placeholder=(
                        "Describe the motion you want to generate.\n\n"
                        "Tips:\n"
                        "• Start with 'A person...'\n"
                        "• Focus on body movements\n"
                        "• Keep under 60 words\n"
                        "• English only"
                    ),
                    lines=5,
                    max_lines=10,
                )

                rewritten_text = gr.Textbox(
                    label="✏️ Rewritten Prompt (auto-filled after rewrite)",
                    lines=3,
                    interactive=True,
                    visible=True,
                    placeholder="Rewritten prompt will appear here after using 'Rewrite Prompt'.",
                )

                with gr.Row():
                    rewrite_btn = gr.Button("✏️ Rewrite Prompt", variant="secondary", size="sm")
                    use_rewrite_checkbox = gr.Checkbox(
                        label="Auto-rewrite before generate",
                        value=True,
                        scale=1,
                    )

                duration_slider = gr.Slider(
                    minimum=0.5,
                    maximum=12.0,
                    value=DEFAULT_DURATION,
                    step=0.1,
                    label="⏱️ Duration (seconds)",
                )

                with gr.Accordion("🔧 Advanced Settings", open=False):
                    with gr.Row():
                        seed_input = gr.Textbox(
                            label="🎯 Seeds",
                            value=DEFAULT_SEEDS,
                            placeholder="e.g., 0,1,2,3",
                            scale=3,
                        )
                        dice_btn = gr.Button("🎲", size="sm", scale=1)

                    cfg_slider = gr.Slider(
                        minimum=1.0,
                        maximum=10.0,
                        value=DEFAULT_CFG,
                        step=0.1,
                        label="⚙️ CFG Strength",
                        info="Higher = closer to prompt",
                    )

                generate_btn = gr.Button(
                    "🚀 Generate Motion",
                    variant="primary",
                    size="lg",
                    elem_classes=["generate-button"],
                )

                status_output = gr.Textbox(
                    label="📊 Status",
                    value="Ready. Enter a description and click Generate.",
                    lines=2,
                    interactive=False,
                )

            # ── Right panel ─────────────────────────────────────────
            with gr.Column(scale=3):
                motion_output = gr.HTML(
                    value=PLACEHOLDER_HTML,
                    label="🎬 Generated Motion",
                )

                file_output = gr.File(
                    label="📦 Download FBX Files",
                    file_count="multiple",
                    visible=False,
                )

        # ── Example prompts ─────────────────────────────────────────
        with gr.Accordion("📚 Example Prompts", open=True):
            gr.Markdown("Click an example to load it into the text field:")
            gr.Examples(
                examples=[[p, d] for p, d in EXAMPLE_PROMPTS],
                inputs=[text_input, duration_slider],
                label=None,
            )

        gr.HTML(FOOTER_HTML)

        # ── Event handlers ───────────────────────────────────────────

        def on_rewrite(api_key, text, duration):
            if not text.strip():
                return "❌ Please enter a motion description.", text, duration
            if not api_key.strip():
                return "❌ Please enter your API key.", text, duration

            client, conn_status = create_client(api_key)
            if client is None:
                return conn_status, text, duration

            try:
                result = client.predict(
                    text, duration, api_name="/_prompt_engineering"
                )
                rw = str(result[0]) if result[0] else text
                dur = float(result[1]) if result[1] is not None else duration
                return "✅ Prompt rewritten.", rw, dur
            except Exception as e:
                return f"❌ Rewrite failed: {e}", text, duration

        rewrite_btn.click(
            fn=on_rewrite,
            inputs=[api_key_input, text_input, duration_slider],
            outputs=[status_output, rewritten_text, duration_slider],
        )

        def on_generate(api_key, text, rw_text, duration, seeds, cfg, use_rewrite):
            # If user has manually edited rewritten text, use it; otherwise rewrite
            effective_original = text
            if use_rewrite:
                # will rewrite inside do_generate
                for status, html, files in do_generate(api_key, text, duration, seeds, cfg, True):
                    yield status, html, files
            else:
                # Use rewritten_text if provided, else original
                final_rw = rw_text.strip() if rw_text.strip() else text
                for status, html, files in _generate_with_texts(api_key, text, final_rw, duration, seeds, cfg):
                    yield status, html, files

        def _generate_with_texts(api_key, original, rewritten, duration, seeds, cfg):
            if not original.strip():
                yield "❌ Please enter a motion description.", PLACEHOLDER_HTML, gr.update(visible=False)
                return
            if not api_key.strip():
                yield "❌ Please enter your Hugging Face API key.", PLACEHOLDER_HTML, gr.update(visible=False)
                return

            yield "⏳ Connecting...", PLACEHOLDER_HTML, gr.update(visible=False)

            client, conn_status = create_client(api_key)
            if client is None:
                yield conn_status, PLACEHOLDER_HTML, gr.update(visible=False)
                return

            yield "🚀 Generating motion... This may take 1–3 minutes.", PLACEHOLDER_HTML, gr.update(visible=False)

            try:
                result = client.predict(
                    str(original),
                    str(rewritten),
                    str(seeds),
                    float(duration),
                    float(cfg),
                    api_name="/generate_motion_func",
                )
                html_out = result[0] if len(result) > 0 else ""
                fbx_files = result[1] if len(result) > 1 else []

                if not html_out and not fbx_files:
                    yield "⚠️ Generation returned empty output.", PLACEHOLDER_HTML, gr.update(visible=False)
                    return

                yield (
                    "✅ Motion generated successfully!",
                    html_out or PLACEHOLDER_HTML,
                    gr.update(value=fbx_files, visible=bool(fbx_files)),
                )
            except Exception as e:
                yield f"❌ Generation failed: {e}", PLACEHOLDER_HTML, gr.update(visible=False)

        generate_btn.click(
            fn=on_generate,
            inputs=[api_key_input, text_input, rewritten_text, duration_slider, seed_input, cfg_slider, use_rewrite_checkbox],
            outputs=[status_output, motion_output, file_output],
        )

        dice_btn.click(fn=generate_random_seeds, outputs=[seed_input])

    return demo


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="HY-Motion 1.0 Web Interface")
    parser.add_argument("--port", type=int, default=7860)
    parser.add_argument("--share", action="store_true")
    args = parser.parse_args()

    print("=" * 60)
    print("  HY-Motion 1.0 — Text-to-3D Motion Generation")
    print(f"  http://localhost:{args.port}")
    print("=" * 60)

    demo = create_app()
    demo.launch(
        server_name="0.0.0.0",
        server_port=args.port,
        share=args.share,
        theme=gr.themes.Base(),
        css=APP_CSS,
    )
