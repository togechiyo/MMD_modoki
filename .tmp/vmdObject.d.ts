import type { ILogger } from "./ILogger";
import { MmdDataDeserializer } from "./mmdDataDeserializer";
import type { Vec3, Vec4 } from "./mmdTypes";
/**
 * VMD data
 *
 * The creation of this object means that the validation and indexing of the Vmd data are finished
 *
 * Therefore, there is no parsing error when reading data from VmdData
 */
export declare class VmdData {
    private static readonly _Signature;
    /**
     * Signature bytes
     *
     * The first 30 bytes of the VMD file must be "Vocaloid Motion Data 0002"
     * @internal
     */
    static readonly SignatureBytes = 30;
    /**
     * Model name bytes
     *
     * The next 20 bytes of the VMD file must be the model name
     *
     * MMD assuming that motion is usually valid for one model
     *
     * so when binding target model name is different from the model name in VMD file, MMD warns the user
     * @internal
     */
    static readonly ModelNameBytes = 20;
    /**
     * Bone key frame bytes
     * @internal
     */
    static readonly BoneKeyFrameBytes: number;
    /**
     * Morph key frame bytes
     * @internal
     */
    static readonly MorphKeyFrameBytes: number;
    /**
     * Camera key frame bytes
     * @internal
     */
    static readonly CameraKeyFrameBytes: number;
    /**
     * Light key frame bytes
     * @internal
     */
    static readonly LightKeyFrameBytes: number;
    /**
     * Self shadow key frame bytes
     * @internal
     */
    static readonly SelfShadowKeyFrameBytes: number;
    /**
     * Property key frame bytes
     * @internal
     */
    static readonly PropertyKeyFrameBytes: number;
    /**
     * Property key frame IK state bytes
     * @internal
     */
    static readonly PropertyKeyFrameIkStateBytes: number;
    /**
     * Data deserializer for reading VMD data
     * @internal
     */
    readonly dataDeserializer: MmdDataDeserializer;
    /**
     * Bone key frame count
     */
    readonly boneKeyFrameCount: number;
    /**
     * Morph key frame count
     */
    readonly morphKeyFrameCount: number;
    /**
     * Camera key frame count
     */
    readonly cameraKeyFrameCount: number;
    /**
     * Light key frame count
     */
    readonly lightKeyFrameCount: number;
    /**
     * Self shadow key frame count
     */
    readonly selfShadowKeyFrameCount: number;
    /**
     * Property key frame count
     */
    readonly propertyKeyFrameCount: number;
    private constructor();
    /**
     * Create a new `VmdData` instance from the given buffer
     * @param buffer ArrayBuffer
     * @param logger Logger
     * @returns `VmdData` instance if the given buffer is a valid VMD data, otherwise `null`
     */
    static CheckedCreate(buffer: ArrayBufferLike, logger?: ILogger): VmdData | null;
}
/**
 * VMD object
 *
 * Lazy parsed VMD data object
 *
 * The total amount of memory used is more than parsing at once
 *
 * but you can adjust the instantaneous memory usage to a smaller extent
 */
export declare class VmdObject {
    /**
     * Property key frames
     *
     * Property key frames are only preparsed because they size is not fixed
     */
    readonly propertyKeyFrames: readonly VmdObject.PropertyKeyFrame[];
    private readonly _vmdData;
    private constructor();
    /**
     * Parse VMD data
     * @param vmdData VMD data
     * @returns `VmdObject` instance
     */
    static Parse(vmdData: VmdData): VmdObject;
    /**
     * Parse VMD data from the given buffer
     * @param buffer ArrayBuffer
     * @returns `VmdObject` instance
     * @throws {Error} if the given buffer is not a valid VMD data
     */
    static ParseFromBuffer(buffer: ArrayBufferLike): VmdObject;
    /**
     * Get bone key frame reader
     */
    get boneKeyFrames(): VmdObject.BoneKeyFrames;
    /**
     * Get morph key frame reader
     */
    get morphKeyFrames(): VmdObject.MorphKeyFrames;
    /**
     * Get camera key frame reader
     */
    get cameraKeyFrames(): VmdObject.CameraKeyFrames;
    /**
     * Get light key frame reader
     */
    get lightKeyFrames(): VmdObject.LightKeyFrames;
    /**
     * Get self shadow key frame reader
     */
    get selfShadowKeyFrames(): VmdObject.SelfShadowKeyFrames;
}
export declare namespace VmdObject {
    /**
     * key frame reader base class
     */
    abstract class BufferArrayReader<T> {
        protected readonly _dataDeserializer: MmdDataDeserializer;
        protected readonly _startOffset: number;
        private readonly _length;
        /**
         * Create a new `BufferArrayReader` instance
         * @param dataDeserializer Data deserializer
         * @param startOffset Data start offset
         * @param length Data length
         */
        constructor(dataDeserializer: MmdDataDeserializer, startOffset: number, length: number);
        /**
         * Length of the data
         */
        get length(): number;
        /**
         * Get the data at the given index
         * @param index Index
         */
        abstract get(index: number): T;
    }
    /**
     * Bone key frame reader
     */
    class BoneKeyFrames extends BufferArrayReader<BoneKeyFrame> {
        /**
         * Create a new `BoneKeyFrames` instance
         * @param dataDeserializer Data deserializer
         * @param startOffset Data start offset
         * @param length Data length
         */
        constructor(dataDeserializer: MmdDataDeserializer, startOffset: number, length: number);
        /**
         * Get the data at the given index
         * @param index Index
         * @returns `BoneKeyFrame` instance
         */
        get(index: number): BoneKeyFrame;
    }
    /**
     * Bone key frame
     */
    class BoneKeyFrame {
        /**
         * Bone name
         */
        readonly boneName: string;
        /**
         * Frame number
         */
        readonly frameNumber: number;
        /**
         * Position
         */
        readonly position: Vec3;
        /**
         * Rotation quaternion
         */
        readonly rotation: Vec4;
        /**
         * Interpolation
         *
         * https://hariganep.seesaa.net/article/201103article_1.html
         * https://x.com/KuroNekoMeguMMD/status/1864306974856499520/
         *
         * The interpolation parameters are four Bezier curves (0,0), (x1,y1), (x2,y2), and (127,127)
         *
         * It represents the parameters of each axis
         *
         * - X-axis interpolation parameters (X_x1, X_y1), (X_x2, X_y2)
         * - Y-axis interpolation parameters (Y_x1, Y_y1), (Y_x2, Y_y2)
         * - Z-axis interpolation parameters (Z_x1, Z_y1), (Z_x2, Z_y2)
         * - Rotation interpolation parameters (R_x1, R_y1), (R_x2, R_y2)
         *
         * And interpolation parameters also include physics toggle parameters
         * - Physics toggle parameters (phy1, phy2)
         *
         * Physics toggle parameters has two varients
         * - phy1: 0x00, phy2: 0x00 (physics off)
         * - phy1: 0x63, phy2: 0x0f (physics on)
         *
         * Then, the interpolation parameters are as follows
         *
         * X_x1,Y_x1,phy1,phy2,
         * X_y1,Y_y1,Z_y1,R_y1,
         * X_x2,Y_x2,Z_x2,R_x2,
         * X_y2,Y_y2,Z_y2,R_y2,
         *
         * Y_x1,Z_x1,R_x1,X_y1,
         * Y_y1,Z_y1,R_y1,X_x2,
         * Y_x2,Z_x2,R_x2,X_y2,
         * Y_y2,Z_y2,R_y2, 00,
         *
         * Z_x1,R_x1,X_y1,Y_y1,
         * Z_y1,R_y1,X_x2,Y_x2,
         * Z_x2,R_x2,X_y2,Y_y2,
         * Z_y2,R_y2, 00, 00,
         *
         * R_x1,X_y1,Y_y1,Z_y1,
         * R_y1,X_x2,Y_x2,Z_x2,
         * R_x2,X_y2,Y_y2,Z_y2,
         * R_y2, 00, 00, 00
         *
         * [4][4][4] = [64]
         */
        readonly interpolation: Uint8Array;
        /**
         * Create a new `BoneKeyFrame` instance
         * @param dataDeserializer Data deserializer
         * @param offset Data offset
         */
        constructor(dataDeserializer: MmdDataDeserializer, offset: number);
    }
    enum BoneKeyFramePhysicsInfoKind {
        /**
         * Physics off
         *
         * Rigid body position is driven by animation
         */
        Off = 25359,
        /**
         * Physics on
         *
         * Rigid body position is driven by physics, only affected when the bone has a rigid body
         */
        On = 0
    }
    /**
     * Morph key frame reader
     */
    class MorphKeyFrames extends BufferArrayReader<MorphKeyFrame> {
        /**
         * Create a new `MorphKeyFrames` instance
         * @param dataDeserializer Data deserializer
         * @param startOffset Data start offset
         * @param length Data length
         */
        constructor(dataDeserializer: MmdDataDeserializer, startOffset: number, length: number);
        /**
         * Get the data at the given index
         * @param index Index
         * @returns `MorphKeyFrame` instance
         */
        get(index: number): MorphKeyFrame;
    }
    /**
     * Morph key frame
     */
    class MorphKeyFrame {
        /**
         * Morph name
         */
        readonly morphName: string;
        /**
         * Frame number
         */
        readonly frameNumber: number;
        /**
         * Weight
         */
        readonly weight: number;
        /**
         * Create a new `MorphKeyFrame` instance
         * @param dataDeserializer Data deserializer
         * @param offset Data offset
         */
        constructor(dataDeserializer: MmdDataDeserializer, offset: number);
    }
    /**
     * Camera key frame reader
     */
    class CameraKeyFrames extends BufferArrayReader<CameraKeyFrame> {
        /**
         * Create a new `CameraKeyFrames` instance
         * @param dataDeserializer Data deserializer
         * @param startOffset Data start offset
         * @param length Data length
         */
        constructor(dataDeserializer: MmdDataDeserializer, startOffset: number, length: number);
        /**
         * Get the data at the given index
         * @param index Index
         * @returns `CameraKeyFrame` instance
         */
        get(index: number): CameraKeyFrame;
    }
    /**
     * Camera key frame
     */
    class CameraKeyFrame {
        /**
         * Frame number
         */
        readonly frameNumber: number;
        /**
         * Distance from the camera center
         */
        readonly distance: number;
        /**
         * Camera center position
         */
        readonly position: Vec3;
        /**
         * Camera rotation in yaw, pitch, roll order
         */
        readonly rotation: Vec3;
        /**
         * Interpolation
         *
         * range: 0..=127
         *
         * default linear interpolation is 20, 107, 20, 107
         *
         * Repr:
         *
         * x_ax, x_bx, x_ay, x_by,
         * y_ax, y_bx, y_ay, y_by,
         * z_ax, z_bx, z_ay, z_by,
         * rot_ax, rot_bx, rot_ay, rot_by,
         * distance_ax, distance_bx, distance_ay, distance_by,
         * angle_ax, angle_bx, angle_ay, angle_by
         */
        readonly interpolation: Uint8Array;
        /**
         * Angle of view (in degrees)
         */
        readonly fov: number;
        /**
         * Whether the camera is perspective or orthographic
         */
        readonly perspective: boolean;
        /**
         * Create a new `CameraKeyFrame` instance
         * @param dataDeserializer Data deserializer
         * @param offset Data offset
         */
        constructor(dataDeserializer: MmdDataDeserializer, offset: number);
    }
    /**
     * Light key frame reader
     */
    class LightKeyFrames extends BufferArrayReader<LightKeyFrame> {
        /**
         * Create a new `LightKeyFrames` instance
         * @param dataDeserializer Data deserializer
         * @param startOffset Data start offset
         * @param length Data length
         */
        constructor(dataDeserializer: MmdDataDeserializer, startOffset: number, length: number);
        /**
         * Get the data at the given index
         * @param index Index
         * @returns `LightKeyFrame` instance
         */
        get(index: number): LightKeyFrame;
    }
    /**
     * Light key frame
     */
    class LightKeyFrame {
        /**
         * Frame number
         */
        readonly frameNumber: number;
        /**
         * Light color
         */
        readonly color: Vec3;
        /**
         * Light direction
         */
        readonly direction: Vec3;
        /**
         * Create a new `LightKeyFrame` instance
         * @param dataDeserializer Data deserializer
         * @param offset Data offset
         */
        constructor(dataDeserializer: MmdDataDeserializer, offset: number);
    }
    /**
     * Self shadow key frame reader
     */
    class SelfShadowKeyFrames extends BufferArrayReader<SelfShadowKeyFrame> {
        /**
         * Create a new `SelfShadowKeyFrames` instance
         * @param dataDeserializer Data deserializer
         * @param startOffset Data start offset
         * @param length Data length
         */
        constructor(dataDeserializer: MmdDataDeserializer, startOffset: number, length: number);
        /**
         * Get the data at the given index
         * @param index Index
         * @returns `SelfShadowKeyFrame` instance
         */
        get(index: number): SelfShadowKeyFrame;
    }
    /**
     * Self shadow key frame
     */
    class SelfShadowKeyFrame {
        /**
         * Frame number
         */
        readonly frameNumber: number;
        /**
         * Shadow mode
         */
        readonly mode: number;
        /**
         * Distance
         */
        readonly distance: number;
        /**
         * Create a new `SelfShadowKeyFrame` instance
         * @param dataDeserializer Data deserializer
         * @param offset Data offset
         */
        constructor(dataDeserializer: MmdDataDeserializer, offset: number);
    }
    /**
     * Property key frame
     */
    type PropertyKeyFrame = Readonly<{
        /**
         * Frame number
         */
        frameNumber: number;
        /**
         * Visibility
         */
        visible: boolean;
        /**
         * IK states
         */
        ikStates: readonly PropertyKeyFrame.IKState[];
    }>;
    namespace PropertyKeyFrame {
        /**
         * IK state [bone name, ik enabled]
         */
        type IKState = Readonly<[string, boolean]>;
    }
}
