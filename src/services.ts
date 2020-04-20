import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { WebGLRenderer, LoadingManager } from "three"
import { renderer, loader } from '@/component'
import { EventBus } from "ts-bus"

const loadingManager = loader.manager = new LoadingManager();

export const diProvide: Array<any> = [
    EventBus,
    { key: GLTFLoader, value: loader },
    { key: WebGLRenderer, value: renderer },
    { key: LoadingManager, value: loadingManager },
]