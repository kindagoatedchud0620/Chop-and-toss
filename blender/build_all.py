"""Build every model to assets/models/*.glb with headless Blender.

    blender --background --python blender/build_all.py            (Blender app)
    python blender/build_all.py [name ...]                        (bpy module)
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
import stations, food, chefs, props  # noqa: F401  (registers models)

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [a for a in sys.argv[1:] if not a.startswith('-') and not a.endswith('.py')]
    print(f'building {len(args) or len(kit.MODELS)} models')
    kit.build(args or None)
    # manifest for the game loader
    import json
    with open(os.path.join(kit.OUT, 'manifest.json'), 'w') as f:
        json.dump(sorted(n[:-4] for n in os.listdir(kit.OUT) if n.endswith('.glb')), f)
    print('done')
